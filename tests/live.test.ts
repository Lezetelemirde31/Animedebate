/**
 * Live room engine, driven through the same service functions the HTTP API
 * uses. Runs on the in-memory preview store by default; set DATABASE_URL to
 * run the same scenarios against PostgreSQL (row locks, real transactions).
 *
 * Only `Date` is faked: the engine reads the clock per request, so the test
 * moves time forward and keeps both players' heartbeats fresh like a browser
 * polling once a second would.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabaseUrl, prisma } from "@/lib/db";
import { createRoom, roomRequest, joinQueue, setEngineHooks, EngineError } from "@/server/live/service";
import type { RoomAction, RoomSnapshot } from "@/game/types";

let clock = Date.UTC(2030, 0, 1, 12, 0, 0);
const RUN = Math.random().toString(36).slice(2, 7);
let seq = 0;

async function makeUser(): Promise<string> {
  const username = `t_${RUN}_${++seq}`;
  const u = await prisma.user.create({ data: { username, usernameKey: username.toLowerCase(), passwordHash: "x" } });
  return u.id;
}

const act = (code: string, userId: string, a: RoomAction) => roomRequest(code, userId, a, Date.now());
const sync = (code: string, userId: string) => act(code, userId, { action: "sync" });

/** Moves the clock forward in 1 s steps; `present` users poll every step. */
async function tick(code: string, present: string[], ms: number): Promise<RoomSnapshot | null> {
  let last: RoomSnapshot | null = null;
  for (let left = ms; left > 0; left -= 1000) {
    clock += Math.min(1000, left);
    vi.setSystemTime(clock);
    for (const id of present) last = await sync(code, id);
  }
  return last;
}

async function failure(p: Promise<unknown>): Promise<EngineError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof EngineError) return err;
    throw err;
  }
  throw new Error("expected the request to be rejected");
}

/** Creates a room with two seated, ready players; returns once lot 1 is open. */
async function startedMatch(totalLots = 6) {
  const a = await makeUser();
  const b = await makeUser();
  const code = await createRoom(a, { isPrivate: true, totalLots, bidSeconds: 10, animeIds: ["naruto", "one-piece"] });
  await act(code, a, { action: "join" });
  const joined = await act(code, b, { action: "join" });
  expect(joined.players.map((p) => p.userId).sort()).toEqual([a, b].sort());
  await act(code, a, { action: "ready", ready: true });
  const ready = await act(code, b, { action: "ready", ready: true });
  expect(["COUNTDOWN", "LOBBY"]).toContain(ready.phase);
  const snap = await tick(code, [a, b], 4000);
  expect(snap?.phase).toBe("BIDDING");
  expect(snap?.currentLot?.lotNumber).toBe(1);
  return { a, b, code, snap: snap! };
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
  setEngineHooks({}); // no XP side effects in these tests
});

beforeEach(() => {
  clock += 60 * 60_000;
  vi.setSystemTime(clock);
});

afterAll(() => {
  vi.useRealTimers();
});

/** Never create test users in a remote (e.g. production) database. */
const dbUrl = getDatabaseUrl();
const remoteDb = !!dbUrl && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);
const suite = remoteDb && process.env.ALLOW_REMOTE_TEST_DB !== "1" ? describe.skip : describe;

suite("live auction engine", () => {
  it("plays a full match: bids, sales, balances, collection and result", async () => {
    const { a, b, code, snap } = await startedMatch(6);
    const lot = snap.currentLot!;

    // A opens at the starting price, B raises, A cannot bid an equal amount.
    let s = await act(code, a, { action: "bid", lotId: lot.id, amount: lot.startingPrice });
    expect(s.currentLot?.highestBidderId).toBe(a);
    s = await act(code, b, { action: "bid", lotId: lot.id, amount: lot.startingPrice + 1 });
    expect(s.currentLot?.highestBid).toBe(lot.startingPrice + 1);
    const equal = await failure(act(code, a, { action: "bid", lotId: lot.id, amount: lot.startingPrice + 1 }));
    expect(equal.key).toBe("BELOW_MINIMUM");
    // The leader cannot raise their own bid.
    const self = await failure(act(code, b, { action: "bid", lotId: lot.id, amount: lot.startingPrice + 3 }));
    expect(self.code).toBe("ALREADY_HIGHEST");

    // Clock runs out → B buys lot 1.
    s = (await tick(code, [a, b], 11_000))!;
    expect(s.history[0]).toMatchObject({ lotNumber: 1, status: "SOLD", winnerId: b, finalPrice: lot.startingPrice + 1 });
    const pb = s.players.find((p) => p.userId === b)!;
    expect(pb.balance).toBe(20 - (lot.startingPrice + 1));
    expect(pb.wonCharacterIds).toEqual([lot.character.id]);
    const owned = await prisma.ownedCharacter.findMany({ where: { userId: b } });
    expect(owned.map((o) => o.characterId)).toContain(lot.character.id);

    // Remaining lots: nobody bids → unsold, match completes after the last lot.
    for (let i = 0; i < 40 && s.phase !== "FINISHED"; i++) s = (await tick(code, [a, b], 2000))!;
    expect(s.phase).toBe("FINISHED");
    expect(s.lotsCompleted).toBe(6);
    expect(s.result?.winnerId).toBe(b);
    expect(s.result?.detail.decision?.kind).toBe("score");
    const match = await prisma.match.findUnique({ where: { code } });
    expect(match?.status).toBe("FINISHED");
    expect(match?.endReason).toBe("COMPLETED");
    expect(match?.winnerId).toBe(b);
  });

  it("rejects bids it cannot accept", async () => {
    const { a, b, code, snap } = await startedMatch();
    const lot = snap.currentLot!;
    expect((await failure(act(code, a, { action: "bid", lotId: lot.id, amount: 0 }))).code).toBe("INVALID_AMOUNT");
    expect((await failure(act(code, a, { action: "bid", lotId: lot.id, amount: 21 }))).code).toBe("INSUFFICIENT_BALANCE");
    expect((await failure(act(code, a, { action: "bid", lotId: "nope", amount: 5 }))).code).toBeTruthy();
    expect((await failure(act(code, a, { action: "bid", lotId: lot.id, amount: 2.5 }))).code).toBe("INVALID_AMOUNT");
    await act(code, a, { action: "bid", lotId: lot.id, amount: lot.startingPrice });
    const below = await failure(act(code, b, { action: "bid", lotId: lot.id, amount: lot.startingPrice }));
    expect(below.key).toBe("BELOW_MINIMUM");
    expect(below.params).toMatchObject({ current: lot.startingPrice, min: lot.startingPrice + 1 });
    // A spectator can watch but not bid.
    const c = await makeUser();
    const watched = await act(code, c, { action: "join" });
    expect(watched.players).toHaveLength(2);
    expect(watched.spectators).toBe(1);
    expect((await failure(act(code, c, { action: "bid", lotId: lot.id, amount: 5 }))).code).toBe("NOT_A_PLAYER");
  });

  it("extends the clock when a bid lands in the final seconds", async () => {
    const { a, code, snap } = await startedMatch();
    const lot = snap.currentLot!;
    const s = (await tick(code, [a, snap.players.find((p) => p.userId !== a)!.userId], 7000))!;
    expect(s.currentLot!.endsAt! - Date.now()).toBeLessThanOrEqual(3000);
    const after = await act(code, a, { action: "bid", lotId: lot.id, amount: lot.startingPrice });
    expect(after.currentLot!.endsAt! - Date.now()).toBeGreaterThanOrEqual(5900);
  });

  it("pauses when a player disappears and forfeits them after the grace period", async () => {
    const { a, b, code } = await startedMatch();
    // B stops polling.
    let s = (await tick(code, [a], 10_000))!;
    expect(s.phase).toBe("PAUSED");
    expect(s.players.find((p) => p.userId === b)?.connected).toBe(false);
    s = (await tick(code, [a], 61_000))!;
    expect(s.phase).toBe("FINISHED");
    expect(s.result?.winnerId).toBe(a);
    expect(s.result?.detail.note).toBe("no_reconnect");
  });

  it("resumes when the player comes back in time", async () => {
    const { a, b, code } = await startedMatch();
    let s = (await tick(code, [a], 10_000))!;
    expect(s.phase).toBe("PAUSED");
    s = (await tick(code, [a, b], 2000))!;
    expect(s.phase).toBe("BIDDING");
    expect(s.currentLot!.endsAt! - Date.now()).toBeGreaterThanOrEqual(5000);
  });

  it("awards the match to the opponent when a player leaves", async () => {
    const { a, b, code } = await startedMatch();
    const s = await act(code, b, { action: "leave" });
    expect(s.phase).toBe("FINISHED");
    expect(s.result?.winnerId).toBe(a);
    expect(s.result?.detail).toMatchObject({ note: "left" });
  });

  it("starts a rematch room once both players accept", async () => {
    const { a, b, code } = await startedMatch(6);
    let s: RoomSnapshot | null = null;
    for (let i = 0; i < 60 && s?.phase !== "FINISHED"; i++) s = await tick(code, [a, b], 2000);
    expect(s?.phase).toBe("FINISHED");
    expect(s?.result?.winnerId).toBeNull(); // nothing sold, equal balances → draw
    expect(s?.result?.detail.decision?.kind).toBe("tie");
    s = await act(code, a, { action: "rematch" });
    expect(s.rematchVotes).toEqual([a]);
    expect(s.rematchCode).toBeNull();
    s = await act(code, b, { action: "rematch" });
    expect(s.rematchCode).toBeTruthy();
    const next = await sync(s.rematchCode!, a);
    expect(next.players.map((p) => p.userId).sort()).toEqual([a, b].sort());
    expect(next.phase).toBe("LOBBY");
  });

  it("matchmaking pairs two waiting players into one room", async () => {
    const a = await makeUser();
    const b = await makeUser();
    expect(await joinQueue(a)).toBeNull();
    const code = await joinQueue(b);
    expect(code).toBeTruthy();
    const s = await act(code!, a, { action: "join" });
    expect(s.players.map((p) => p.userId).sort()).toEqual([a, b].sort());
    expect(s.isMatchmade).toBe(true);
  });

  it("a second request in the same room never sells a lot twice", async () => {
    const { a, b, code, snap } = await startedMatch();
    const lot = snap.currentLot!;
    await act(code, a, { action: "bid", lotId: lot.id, amount: lot.startingPrice });
    await tick(code, [a, b], 9000);
    clock += 2000;
    vi.setSystemTime(clock);
    const [x, y] = await Promise.all([sync(code, a), sync(code, b)]);
    expect(x.history.filter((h) => h.id === lot.id)).toHaveLength(1);
    expect(y.history.filter((h) => h.id === lot.id)).toHaveLength(1);
    const sold = await prisma.ownedCharacter.findMany({ where: { userId: a, characterId: lot.character.id } });
    expect(sold).toHaveLength(1);
    const pa = y.players.find((p) => p.userId === a)!;
    expect(pa.balance).toBe(20 - lot.startingPrice);
  });
});
