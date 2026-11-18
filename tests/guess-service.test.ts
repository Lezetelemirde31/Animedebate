import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabaseUrl, prisma } from "@/lib/db";
import { EngineError } from "@/server/live/room";
import { LAST_STAGE, ROUND_SECONDS, dayKey } from "@/game/guess/rules";
import { getGuessStats, runImageTarget, runRequest, startDailyRun, startSoloRun } from "@/server/guess/solo";
import { COUNTDOWN_MS, REVEAL_MS, createRaceRoom, guessQueuePoll, raceImageTarget, raceRequest } from "@/server/guess/race";
import { guessCharacters } from "@/server/guess/shared";

const dbUrl = getDatabaseUrl();
const remoteDb = !!dbUrl && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);
const suite = remoteDb && process.env.ALLOW_REMOTE_TEST_DB !== "1" ? describe.skip : describe;

// Noon in Türkiye, far in the future so test days never clash with real ones.
let clock = Date.UTC(2032, 5, 1, 9);
const RUN = Math.random().toString(36).slice(2, 7);
let n = 0;
const user = async () => {
  const u = `g_${RUN}_${++n}`;
  return (await prisma.user.create({ data: { username: u, usernameKey: u, passwordHash: "x" } })).id;
};
const tick = (ms: number) => {
  clock += ms;
  vi.setSystemTime(clock);
};
async function failure(p: Promise<unknown>): Promise<EngineError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof EngineError) return e;
    throw e;
  }
  throw new Error("expected a rejection");
}
interface StoredRun {
  rounds: { c: string }[];
  index: number;
}
const answerOf = async (runId: string) => {
  const s = (await prisma.guessRun.findUnique({ where: { id: runId } }))!.state as unknown as StoredRun;
  return s.rounds[s.index].c;
};
const roomAnswer = async (code: string) => {
  const s = (await prisma.guessRoom.findUnique({ where: { code } }))!.state as unknown as StoredRun;
  return s.rounds[s.index].c;
};
const wrongFor = async (answer: string) => (await guessCharacters()).list.find((c) => c.id !== answer)!.id;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
});
beforeEach(() => tick(3600_000));
afterAll(() => vi.useRealTimers());

suite("Who Is This Character? — solo and daily", () => {
  it("wrong guesses and hints reveal more; the answer stays hidden until the round ends", async () => {
    const me = await user();
    const id = await startSoloRun(me, { mode: "BLUR", difficulty: "NORMAL", animeId: null });
    let v = await runRequest(id, me, { action: "sync" });
    expect(v.total).toBe(10);
    expect(v.round.stage).toBe(0);
    expect(v.round.answer).toBeNull();
    expect(v.round.hints).toEqual({ animeId: null, initials: null });
    const answer = await answerOf(id);
    expect(JSON.stringify(v)).not.toContain(answer);
    expect(v.round.image).not.toContain(answer);

    // The image route only serves stages already reached.
    expect((await failure(runImageTarget(id, me, 0, 2))).code).toBe("FORBIDDEN");
    expect((await runImageTarget(id, me, 0, 0)).mode).toBe("BLUR");
    const other = await user();
    expect((await failure(runImageTarget(id, other, 0, 0))).code).toBe("NOT_FOUND");
    expect((await failure(runRequest(id, other, { action: "sync" }))).code).toBe("NOT_FOUND");

    const wrong = await wrongFor(answer);
    v = await runRequest(id, me, { action: "guess", characterId: wrong });
    expect(v.round.stage).toBe(1);
    expect(v.round.hints.animeId).toBeTruthy();
    expect(v.round.guesses.map((g) => g.id)).toEqual([wrong]);
    expect((await failure(runRequest(id, me, { action: "guess", characterId: wrong }))).key).toBe("GUESS_ALREADY_TRIED");
    v = await runRequest(id, me, { action: "hint" });
    expect(v.round.stage).toBe(2);
    expect((await failure(runRequest(id, me, { action: "next" }))).key).toBe("GUESS_ROUND_RUNNING");

    tick(3000);
    v = await runRequest(id, me, { action: "guess", characterId: answer });
    expect(v.round.result).toBe("correct");
    expect(v.round.points).toBeGreaterThan(0);
    expect(v.round.answer?.id).toBe(answer);
    expect(v.score).toBe(v.round.points);
    expect(v.streak).toBe(1);

    v = await runRequest(id, me, { action: "next" });
    expect(v.index).toBe(1);
    expect(v.round.stage).toBe(0);
    expect(v.history).toHaveLength(1);

    // Running out of time loses the round.
    tick(ROUND_SECONDS * 1000 + 100);
    v = await runRequest(id, me, { action: "sync" });
    expect(v.round.result).toBe("timeout");
    expect(v.streak).toBe(0);

    v = await runRequest(id, me, { action: "quit" });
    expect(v.finished).toBe(true);
    const rec = await prisma.gameMatchPlayer.findFirst({ where: { userId: me, match: { game: "GUESS", mode: "solo" } } });
    expect(rec).toMatchObject({ score: v.score, result: "LOSS" });
    expect((await getGuessStats(me)).runs).toBe(1);
  });

  it("four wrong guesses lose the round", async () => {
    const me = await user();
    const id = await startSoloRun(me, { mode: "PIXEL", difficulty: "HARD", animeId: null });
    const answer = await answerOf(id);
    const others = (await guessCharacters()).list.filter((c) => c.id !== answer).slice(0, LAST_STAGE + 1);
    let v = await runRequest(id, me, { action: "sync" });
    for (const c of others) v = await runRequest(id, me, { action: "guess", characterId: c.id });
    expect(v.round.result).toBe("wrong");
    expect(v.round.points).toBe(0);
  });

  it("daily challenge: same set for everyone, once a day, with a streak", async () => {
    const a = await user();
    const b = await user();
    const ra = await startDailyRun(a);
    expect(await startDailyRun(a)).toBe(ra);
    const rb = await startDailyRun(b);
    const sa = (await prisma.guessRun.findUnique({ where: { id: ra } }))!.state as unknown as StoredRun;
    const sb = (await prisma.guessRun.findUnique({ where: { id: rb } }))!.state as unknown as StoredRun;
    expect(sa.rounds.map((r) => r.c)).toEqual(sb.rounds.map((r) => r.c));

    async function solveAll(runId: string, userId: string) {
      let v = await runRequest(runId, userId, { action: "sync" });
      while (!v.finished) {
        v = await runRequest(runId, userId, { action: "guess", characterId: await answerOf(runId) });
        if (!v.finished) v = await runRequest(runId, userId, { action: "next" });
      }
      return v;
    }
    const done = await solveAll(ra, a);
    expect(done.correct).toBe(5);
    expect((await getGuessStats(a)).dailyStreak).toBe(1);

    tick(24 * 3600_000);
    const next = await startDailyRun(a);
    expect(next).not.toBe(ra);
    await solveAll(next, a);
    const st = await getGuessStats(a);
    expect(st.dailyStreak).toBe(2);
    expect(st.bestDailyStreak).toBe(2);
    expect(dayKey()).not.toBe(sa ? "" : "x");

    // Missing a day breaks the streak.
    tick(3 * 24 * 3600_000);
    expect((await getGuessStats(a)).dailyStreak).toBe(0);
  });
});

suite("Who Is This Character? — race rooms", () => {
  it("friendly race: host starts, first correct answer scores most, a leaver ends a 2-player race", async () => {
    const a = await user();
    const b = await user();
    const code = await createRaceRoom(a, { rounds: 5, mode: "SHADOW" });
    let vb = await raceRequest(code, b, { action: "join" });
    expect(vb.players).toHaveLength(2);
    expect((await failure(raceRequest(code, b, { action: "start" }))).key).toBe("GUESS_HOST_ONLY");
    await raceRequest(code, a, { action: "settings", settings: { difficulty: "EASY" } });
    let va = await raceRequest(code, a, { action: "start" });
    expect(va.phase).toBe("PLAYING");
    expect(va.settings).toMatchObject({ rounds: 5, mode: "SHADOW", difficulty: "EASY" });
    const answer = await roomAnswer(code);
    expect(JSON.stringify(va)).not.toContain(answer);

    // Nothing can be guessed or seen before the countdown ends.
    expect((await failure(raceRequest(code, a, { action: "guess", characterId: answer, round: 0 }))).key).toBe("GUESS_ROUND_OVER");
    expect((await failure(raceImageTarget(code, a, 0, 0))).code).toBe("FORBIDDEN");
    tick(COUNTDOWN_MS + 1000);
    expect((await raceImageTarget(code, a, 0, 0)).mode).toBe("SHADOW");
    expect((await failure(raceImageTarget(code, a, 0, 2))).code).toBe("FORBIDDEN");
    const outsider = await user();
    expect((await failure(raceImageTarget(code, outsider, 0, 0))).code).toBe("FORBIDDEN");

    vb = await raceRequest(code, b, { action: "guess", characterId: await wrongFor(answer), round: 0 });
    expect(vb.round?.myGuesses).toHaveLength(1);
    va = await raceRequest(code, a, { action: "guess", characterId: answer, round: 0 });
    expect(va.players.find((p) => p.userId === a)?.answered).toMatchObject({ order: 0 });
    tick(1000);
    vb = await raceRequest(code, b, { action: "guess", characterId: answer, round: 0 });
    const pa = vb.players.find((p) => p.userId === a)!;
    const pb = vb.players.find((p) => p.userId === b)!;
    expect(pa.score).toBeGreaterThan(pb.score);
    // Everyone answered: the round closes and shows the answer, then the next round begins.
    expect(vb.round?.closedAt).not.toBeNull();
    expect(vb.round?.answer?.id).toBe(answer);
    tick(REVEAL_MS + 100);
    va = await raceRequest(code, a, { action: "sync" });
    expect(va.round?.number).toBe(2);
    expect(va.round?.answer).toBeNull();

    va = await raceRequest(code, b, { action: "leave" });
    expect(va.phase).toBe("FINISHED");
    expect(va.result).toMatchObject({ reason: "forfeit" });
    expect(va.result!.standings[0].userId).toBe(a);
    const rec = await prisma.gameMatchPlayer.findMany({ where: { match: { game: "GUESS", mode: "race", refId: { startsWith: `room-${code}` } } } });
    expect(rec.find((r) => r.userId === a)).toMatchObject({ result: "WIN" });
    expect(rec.find((r) => r.userId === b)).toMatchObject({ result: "LOSS", xp: 0 });

    // A rematch opens a new lobby the others can join.
    const after = await raceRequest(code, a, { action: "rematch" });
    expect(after.rematchCode).toBeTruthy();
    expect((await raceRequest(after.rematchCode!, a, { action: "sync" })).phase).toBe("LOBBY");
  });

  it("ranked race from the queue changes ratings", async () => {
    const a = await user();
    const b = await user();
    expect((await guessQueuePoll(a, true)).inQueue).toBe(true);
    const paired = await guessQueuePoll(b, true);
    const code = paired.matchedCode!;
    expect(code).toBeTruthy();
    expect((await guessQueuePoll(a, false)).matchedCode).toBe(code);
    let v = await raceRequest(code, a, { action: "sync" });
    expect(v.mode).toBe("ranked");
    expect(v.phase).toBe("PLAYING");
    tick(COUNTDOWN_MS + 500);
    // A gets the first round right; then every round runs out of time.
    await raceRequest(code, a, { action: "guess", characterId: await roomAnswer(code), round: 0 });
    for (let i = 0; i < 40 && v.phase === "PLAYING"; i++) {
      tick((ROUND_SECONDS * 1000 + REVEAL_MS) / 2);
      v = await raceRequest(code, b, { action: "sync" });
    }
    expect(v.phase).toBe("FINISHED");
    expect(v.result!.standings[0].userId).toBe(a);
    expect(v.ratingChange![a]).toBeGreaterThan(0);
    expect(v.ratingChange![b]).toBeLessThan(0);
  });

  it("a player can't sit in two rooms; rooms hold at most 8 players", async () => {
    const host = await user();
    const code = await createRaceRoom(host);
    expect((await failure(createRaceRoom(host))).key).toBe("GUESS_ACTIVE");
    for (let i = 0; i < 7; i++) await raceRequest(code, await user(), { action: "join" });
    expect((await failure(raceRequest(code, await user(), { action: "join" }))).key).toBe("GUESS_ROOM_FULL");
  });
});
