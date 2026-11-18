import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabaseUrl, prisma } from "@/lib/db";
import { EngineError } from "@/server/live/room";
import {
  MAX_TIMEOUTS,
  PICK_MS,
  REVEAL_MS,
  TURN_MS,
  createBotMatch,
  createFriendlyMatch,
  getRoster,
  matchRequest,
  queueLeave,
  queuePoll,
  ratingChangeFor,
  type VersusSnapshot,
} from "@/server/versus/service";

const dbUrl = getDatabaseUrl();
const remoteDb = !!dbUrl && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);
const suite = remoteDb && process.env.ALLOW_REMOTE_TEST_DB !== "1" ? describe.skip : describe;

let clock = Date.UTC(2031, 0, 1, 12);
const RUN = Math.random().toString(36).slice(2, 7);
let n = 0;
const user = async () => {
  const u = `v_${RUN}_${++n}`;
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

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
});
beforeEach(() => tick(3600_000));
afterAll(() => vi.useRealTimers());

suite("Anime 1v1 service", () => {
  it("practice vs bot: draft, battle to the end, rewards in the shared history", async () => {
    const me = await user();
    const code = await createBotMatch(me, "EASY");
    let s = await matchRequest(code, me, { action: "sync" });
    expect(s.phase).toBe("PICK");
    expect(s.seats[1].isBot).toBe(true);
    expect(s.seats[1].picked).toBe(true);
    expect(s.seats[1].pick).toBeNull(); // bot's pick hidden until I pick

    const roster = (await getRoster()).list;
    const mine = roster.find((r) => r.archetype === "POWER")!;
    s = await matchRequest(code, me, { action: "pick", characterId: mine.characterId });
    expect(s.phase).toBe("BATTLE");
    expect(s.seats[0].fighter?.kit.characterId).toBe(mine.characterId);
    expect(s.seats[1].pick).toBeTruthy();

    // A second match can't be started while this one runs.
    expect((await failure(createBotMatch(me, "EASY"))).key).toBe("VERSUS_ACTIVE");

    for (let i = 0; i < 40 && s.phase === "BATTLE"; i++) {
      const f = s.seats[0].fighter!;
      const ult = f.kit.abilities[0];
      const move = f.energy >= ult.cost && !(f.cooldowns[ult.id] > 0) ? { type: "ABILITY" as const, abilityId: ult.id } : { type: "ATTACK" as const };
      s = await matchRequest(code, me, { action: "move", move, turn: s.turn });
      tick(500);
    }
    expect(s.phase).toBe("FINISHED");
    expect(s.log.length).toBeGreaterThan(0);
    const rec = await prisma.gameMatchPlayer.findFirst({ where: { userId: me, match: { game: "VERSUS", mode: "bot" } } });
    expect(rec).toBeTruthy();
    expect(rec!.xp).toBeGreaterThan(0);
  });

  it("friendly: join by code, picks and moves stay hidden until revealed", async () => {
    const a = await user();
    const b = await user();
    const code = await createFriendlyMatch(a);
    let sa = await matchRequest(code, a, { action: "sync" });
    expect(sa.phase).toBe("LOBBY");
    let sb = await matchRequest(code, b, { action: "join" });
    expect(sb.phase).toBe("PICK");
    expect(sb.mySeat).toBe(1);

    const roster = (await getRoster()).list;
    await matchRequest(code, a, { action: "pick", characterId: roster[0].characterId });
    sb = await matchRequest(code, b, { action: "sync" });
    expect(sb.seats[0].picked).toBe(true);
    expect(sb.seats[0].pick).toBeNull(); // hidden from the opponent
    expect((await failure(matchRequest(code, a, { action: "pick", characterId: roster[1].characterId }))).key).toBe("VERSUS_ALREADY_PICKED");
    sb = await matchRequest(code, b, { action: "pick", characterId: roster[1].characterId });
    expect(sb.phase).toBe("BATTLE");
    expect(sb.seats[0].pick).toBe(roster[0].characterId);

    sa = await matchRequest(code, a, { action: "move", move: { type: "ATTACK" }, turn: 1 });
    expect(sa.myMove).toEqual({ type: "ATTACK" });
    sb = await matchRequest(code, b, { action: "sync" });
    expect(sb.seats[0].moveReady).toBe(true);
    expect(sb.myMove).toBeNull();
    expect(JSON.stringify(sb)).not.toContain('"move":{"type":"ATTACK"}');
    expect((await failure(matchRequest(code, a, { action: "move", move: { type: "DEFEND" }, turn: 1 }))).key).toBe("VERSUS_ALREADY_MOVED");
    // Not enough energy for the ultimate yet.
    const ult = sb.seats[1].fighter!.kit.abilities[0];
    expect((await failure(matchRequest(code, b, { action: "move", move: { type: "ABILITY", abilityId: ult.id }, turn: 1 }))).key).toBe("VERSUS_NO_ENERGY");
    sb = await matchRequest(code, b, { action: "move", move: { type: "DEFEND" }, turn: 1 });
    expect(sb.turn).toBe(2);
    expect(sb.log[0].sides[0].move).toEqual({ type: "ATTACK" });
    expect(sb.log[0].sides[1].events.some((e) => e.kind === "blocked")).toBe(true);
    // A move for a turn that is already over is rejected.
    expect((await failure(matchRequest(code, a, { action: "move", move: { type: "ATTACK" }, turn: 1 }))).key).toBe("VERSUS_TURN_OVER");
  });

  it("a player who stops choosing moves loses after repeated timeouts and earns nothing", async () => {
    const a = await user();
    const b = await user();
    const code = await createFriendlyMatch(a);
    await matchRequest(code, b, { action: "join" });
    const roster = (await getRoster()).list;
    await matchRequest(code, a, { action: "pick", characterId: roster[2].characterId });
    let s: VersusSnapshot = await matchRequest(code, b, { action: "pick", characterId: roster[3].characterId });
    for (let i = 0; i < MAX_TIMEOUTS + 1 && s.phase === "BATTLE"; i++) {
      s = await matchRequest(code, a, { action: "move", move: { type: "DEFEND" }, turn: s.turn });
      tick(TURN_MS + REVEAL_MS + 100);
      s = await matchRequest(code, a, { action: "sync" });
    }
    expect(s.phase).toBe("FINISHED");
    expect(s.result).toMatchObject({ winner: 0, reason: "timeout" });
    const rb = await prisma.gameMatchPlayer.findFirst({ where: { userId: b, match: { game: "VERSUS" } } });
    expect(rb).toMatchObject({ result: "LOSS", xp: 0 });
  });

  it("the draft has a time limit: missing picks are filled in", async () => {
    const a = await user();
    const code = await createBotMatch(a, "NORMAL");
    tick(PICK_MS + 1000);
    const s = await matchRequest(code, a, { action: "sync" });
    expect(s.phase).toBe("BATTLE");
    expect(s.seats[0].pick).toBeTruthy();
    await matchRequest(code, a, { action: "leave" });
  });

  it("leaving a ranked match forfeits it and costs rating", async () => {
    const a = await user();
    const b = await user();
    expect((await queuePoll(a, true)).inQueue).toBe(true);
    const paired = await queuePoll(b, true);
    expect(paired.matchedCode).toBeTruthy();
    const code = paired.matchedCode!;
    // A learns about the match on its next poll.
    expect((await queuePoll(a, false)).matchedCode).toBe(code);
    let s = await matchRequest(code, a, { action: "sync" });
    expect(s.mode).toBe("ranked");
    expect(s.phase).toBe("PICK");
    const roster = (await getRoster()).list;
    await matchRequest(code, a, { action: "pick", characterId: roster[5].characterId });
    s = await matchRequest(code, b, { action: "pick", characterId: roster[6].characterId });
    s = await matchRequest(code, a, { action: "move", move: { type: "ATTACK" }, turn: 1 });
    s = await matchRequest(code, b, { action: "move", move: { type: "ATTACK" }, turn: 1 });
    s = await matchRequest(code, b, { action: "leave" });
    expect(s.result).toMatchObject({ winner: s.seats.findIndex((x) => x.userId === a), reason: "forfeit" });
    const change = await ratingChangeFor(code, s.createdAt, s.seats.map((x) => x.userId));
    const ia = s.seats.findIndex((x) => x.userId === a);
    expect(change![ia]).toBeGreaterThan(0);
    expect(change![1 - ia]).toBeLessThan(0);
  });

  it("queue: far-apart ratings wait, close ones pair; leaving the queue works", async () => {
    const a = await user();
    expect((await queuePoll(a, true)).inQueue).toBe(true);
    await queueLeave(a);
    expect((await queuePoll(a, false)).inQueue).toBe(false);
  });
});
