import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabaseUrl, prisma } from "@/lib/db";
import { EngineError } from "@/server/live/room";
import { QUESTION_SECONDS, TIME_JOKER_SECONDS } from "@/game/quiz/rules";
import { getQuizStats, quizRunRequest, startDailyQuiz, startQuizRun } from "@/server/quiz/solo";
import { QUIZ_COUNTDOWN_MS, QUIZ_REVEAL_MS, createQuizRoom, optionOrder, quizQueuePoll, quizRaceRequest } from "@/server/quiz/race";

const dbUrl = getDatabaseUrl();
const remoteDb = !!dbUrl && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);
const suite = remoteDb && process.env.ALLOW_REMOTE_TEST_DB !== "1" ? describe.skip : describe;

let clock = Date.UTC(2033, 2, 1, 9);
const RUN = Math.random().toString(36).slice(2, 7);
let n = 0;
const user = async () => {
  const u = `q_${RUN}_${++n}`;
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
interface Stored {
  items: { correct: number }[];
  index: number;
  seed?: number;
}
const runAnswer = async (id: string) => {
  const s = (await prisma.quizRun.findUnique({ where: { id } }))!.state as unknown as Stored;
  return s.items[s.index].correct;
};
/** The option a player must click (in their own order) to answer the current race question correctly. */
const roomAnswerFor = async (code: string, userId: string) => {
  const s = (await prisma.quizRoom.findUnique({ where: { code } }))!.state as unknown as Stored & { seed: number };
  return optionOrder(s.seed, userId, s.index).indexOf(s.items[s.index].correct);
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
});
beforeEach(() => tick(3600_000));
afterAll(() => vi.useRealTimers());

suite("Anime Quiz — solo and daily", () => {
  it("the answer stays hidden until answered; streaks, jokers and timeouts work", async () => {
    const me = await user();
    const id = await startQuizRun(me, { difficulty: "MIXED", animeId: null });
    let v = await quizRunRequest(id, me, { action: "sync" });
    expect(v.total).toBe(10);
    expect(v.question.correct).toBeNull();
    expect(v.question.options.tr).toHaveLength(4);
    const other = await user();
    expect((await failure(quizRunRequest(id, other, { action: "sync" }))).code).toBe("NOT_FOUND");

    // 50/50 hides two wrong options; it can only be used once per run.
    const correct = await runAnswer(id);
    v = await quizRunRequest(id, me, { action: "joker", kind: "fifty" });
    expect(v.question.hidden).toHaveLength(2);
    expect(v.question.hidden).not.toContain(correct);
    expect((await failure(quizRunRequest(id, me, { action: "joker", kind: "fifty" }))).key).toBe("QUIZ_JOKER_USED");
    expect((await failure(quizRunRequest(id, me, { action: "answer", choice: v.question.hidden[0], question: 0 }))).key).toBe("QUIZ_BAD_CHOICE");

    tick(2000);
    v = await quizRunRequest(id, me, { action: "answer", choice: correct, question: 0 });
    expect(v.question.result).toBe("correct");
    expect(v.question.correct).toBe(correct);
    expect(v.question.points).toBeGreaterThan(100);
    expect(v.streak).toBe(1);
    expect((await failure(quizRunRequest(id, me, { action: "answer", choice: correct, question: 0 }))).key).toBe("QUIZ_QUESTION_OVER");

    v = await quizRunRequest(id, me, { action: "next" });
    expect(v.index).toBe(1);
    // A wrong answer resets the streak and reveals the right one.
    const right = await runAnswer(id);
    v = await quizRunRequest(id, me, { action: "answer", choice: (right + 1) % 4, question: 1 });
    expect(v.question.result).toBe("wrong");
    expect(v.question.correct).toBe(right);
    expect(v.streak).toBe(0);

    // The time joker adds seconds; without an answer the question times out.
    v = await quizRunRequest(id, me, { action: "next" });
    const ends = v.question.endsAt!;
    v = await quizRunRequest(id, me, { action: "joker", kind: "time" });
    expect(v.question.endsAt).toBe(ends + TIME_JOKER_SECONDS * 1000);
    tick((QUESTION_SECONDS + TIME_JOKER_SECONDS) * 1000 + 100);
    v = await quizRunRequest(id, me, { action: "sync" });
    expect(v.question.result).toBe("timeout");

    v = await quizRunRequest(id, me, { action: "quit" });
    expect(v.finished).toBe(true);
    expect(v.correct).toBe(1);
    const rec = await prisma.gameMatchPlayer.findFirst({ where: { userId: me, match: { game: "QUIZ", mode: "solo" } } });
    expect(rec).toMatchObject({ score: v.score, result: "LOSS" });
    expect((await getQuizStats(me)).answered).toBe(3);
  });

  it("daily quiz: same questions for everyone, once a day, with a streak", async () => {
    const a = await user();
    const b = await user();
    const ra = await startDailyQuiz(a);
    expect(await startDailyQuiz(a)).toBe(ra);
    const rb = await startDailyQuiz(b);
    const qa = ((await prisma.quizRun.findUnique({ where: { id: ra } }))!.state as unknown as { items: { id: string }[] }).items.map((x) => x.id);
    const qb = ((await prisma.quizRun.findUnique({ where: { id: rb } }))!.state as unknown as { items: { id: string }[] }).items.map((x) => x.id);
    expect(qa).toEqual(qb);

    async function solve(runId: string, userId: string) {
      let v = await quizRunRequest(runId, userId, { action: "sync" });
      while (!v.finished) {
        v = await quizRunRequest(runId, userId, { action: "answer", choice: await runAnswer(runId), question: v.index });
        if (!v.finished) v = await quizRunRequest(runId, userId, { action: "next" });
      }
      return v;
    }
    const done = await solve(ra, a);
    expect(done.correct).toBe(10);
    expect(done.bestStreak).toBe(10);
    expect((await getQuizStats(a)).dailyStreak).toBe(1);
    tick(24 * 3600_000);
    await solve(await startDailyQuiz(a), a);
    expect((await getQuizStats(a)).dailyStreak).toBe(2);
  });
});

suite("Anime Quiz — race rooms", () => {
  it("everyone sees their own option order; the first correct answer earns a bonus", async () => {
    const a = await user();
    const b = await user();
    const code = await createQuizRoom(a, { questions: 5 });
    await quizRaceRequest(code, b, { action: "join" });
    expect((await failure(quizRaceRequest(code, b, { action: "start" }))).key).toBe("QUIZ_HOST_ONLY");
    let va = await quizRaceRequest(code, a, { action: "start" });
    expect(va.phase).toBe("PLAYING");
    expect(va.question?.q.tr).toBe(""); // nothing before the countdown ends
    expect((await failure(quizRaceRequest(code, a, { action: "answer", choice: 0, question: 0 }))).key).toBe("QUIZ_QUESTION_OVER");
    tick(QUIZ_COUNTDOWN_MS + 1000);
    va = await quizRaceRequest(code, a, { action: "sync" });
    expect(va.question?.q.tr.length).toBeGreaterThan(5);
    expect(va.question?.correct).toBeNull();

    const ca = await roomAnswerFor(code, a);
    const cb = await roomAnswerFor(code, b);
    va = await quizRaceRequest(code, a, { action: "answer", choice: ca, question: 0 });
    expect(va.question?.correct).toBe(ca);
    expect(va.players.find((p) => p.userId === a)?.gotIt).toBe(true);
    // B can see that A answered, but not whether A was right.
    let vb = await quizRaceRequest(code, b, { action: "sync" });
    expect(vb.players.find((p) => p.userId === a)).toMatchObject({ answered: true, gotIt: null });
    tick(1000);
    vb = await quizRaceRequest(code, b, { action: "answer", choice: cb, question: 0 });
    const pa = vb.players.find((p) => p.userId === a)!;
    const pb = vb.players.find((p) => p.userId === b)!;
    expect(pa.score).toBeGreaterThan(pb.score);
    expect(vb.question?.closedAt).not.toBeNull();
    tick(QUIZ_REVEAL_MS + 100);
    va = await quizRaceRequest(code, a, { action: "sync" });
    expect(va.question?.number).toBe(2);

    va = await quizRaceRequest(code, b, { action: "leave" });
    expect(va.phase).toBe("FINISHED");
    expect(va.result!.standings[0].userId).toBe(a);
    const after = await quizRaceRequest(code, a, { action: "rematch" });
    expect(after.rematchCode).toBeTruthy();
  });

  it("ranked race from the queue changes ratings", async () => {
    const a = await user();
    const b = await user();
    expect((await quizQueuePoll(a, true)).inQueue).toBe(true);
    const code = (await quizQueuePoll(b, true)).matchedCode!;
    expect(code).toBeTruthy();
    expect((await quizQueuePoll(a, false)).matchedCode).toBe(code);
    let v = await quizRaceRequest(code, a, { action: "sync" });
    expect(v.mode).toBe("ranked");
    tick(QUIZ_COUNTDOWN_MS + 500);
    await quizRaceRequest(code, a, { action: "answer", choice: await roomAnswerFor(code, a), question: 0 });
    for (let i = 0; i < 40 && v.phase === "PLAYING"; i++) {
      tick((QUESTION_SECONDS * 1000 + QUIZ_REVEAL_MS) / 2);
      v = await quizRaceRequest(code, b, { action: "sync" });
    }
    expect(v.phase).toBe("FINISHED");
    expect(v.result!.standings[0].userId).toBe(a);
    expect(v.ratingChange![a]).toBeGreaterThan(0);
    expect(v.ratingChange![b]).toBeLessThan(0);
  });
});
