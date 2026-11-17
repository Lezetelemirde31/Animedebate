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
async function startedMatch() {
  const a = await makeUser();
  const b = await makeUser();
  const code = await createRoom(a, { isPrivate: true, bidSeconds: 10, animeIds: ["naruto", "one-piece"] });
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

/** Polls with both players until the match is over. */
async function playOut(code: string, a: string, b: string, each?: (s: RoomSnapshot) => Promise<void>): Promise<RoomSnapshot> {
  let s: RoomSnapshot | null = null;
  for (let i = 0; i < 400 && s?.phase !== "FINISHED"; i++) {
    s = await tick(code, [a, b], 1000);
    if (s && each) await each(s);
  }
  expect(s?.phase).toBe("FINISHED");
  return s!;
}

const teamOf = (s: RoomSnapshot, id: string) => s.players.find((p) => p.userId === id)!;

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
  it("plays a full match: teams of five, alternating forced openings", async () => {
    const { a, b, code, snap } = await startedMatch();
    const lot = snap.currentLot!;
    // Lot 1 is open: nobody is forced.
    expect(lot.forcedOpenerId).toBeNull();
    expect(lot.highestBid).toBeNull();
    expect(snap.settings.teamSize).toBe(5);

    // A opens, B raises, A re-raises and wins (the scenario from the rules).
    let s = await act(code, a, { action: "bid", lotId: lot.id, amount: lot.startingPrice });
    expect(s.currentLot?.highestBidderId).toBe(a);
    s = await act(code, b, { action: "bid", lotId: lot.id, amount: lot.startingPrice + 1 });
    const equal = await failure(act(code, a, { action: "bid", lotId: lot.id, amount: lot.startingPrice + 1 }));
    expect(equal.key).toBe("BELOW_MINIMUM");
    const self = await failure(act(code, b, { action: "bid", lotId: lot.id, amount: lot.startingPrice + 3 }));
    expect(self.code).toBe("ALREADY_HIGHEST");
    s = await act(code, a, { action: "bid", lotId: lot.id, amount: lot.startingPrice + 2 });

    s = (await tick(code, [a, b], 11_000))!;
    expect(s.history[0]).toMatchObject({ lotNumber: 1, status: "SOLD", winnerId: a, finalPrice: lot.startingPrice + 2 });
    expect(teamOf(s, a).balance).toBe(20 - (lot.startingPrice + 2));
    const owned = await prisma.ownedCharacter.findMany({ where: { userId: a } });
    expect(owned.map((o) => o.characterId)).toContain(lot.character.id);
    // A opened lot 1, so B must open lot 2.
    expect(s.nextOpenerId).toBe(b);

    s = (await tick(code, [a, b], 6000))!;
    expect(s.phase).toBe("BIDDING");
    expect(s.currentLot).toMatchObject({ lotNumber: 2, forcedOpenerId: b, highestBidderId: b });
    expect(s.currentLot!.highestBid).toBe(s.currentLot!.startingPrice);
    expect(s.currentLot!.bids).toHaveLength(1);

    // Nobody else bids: every lot goes to the player whose turn it was, turns alternate.
    const openers: string[] = [];
    const final = await playOut(code, a, b, async (x) => {
      const l = x.currentLot;
      if (x.phase === "BIDDING" && l?.forcedOpenerId && openers.at(-1) !== `${l.lotNumber}:${l.forcedOpenerId}`) {
        openers.push(`${l.lotNumber}:${l.forcedOpenerId}`);
      }
    });
    expect(teamOf(final, a).wonCharacterIds).toHaveLength(5);
    expect(teamOf(final, b).wonCharacterIds).toHaveLength(5);
    expect(final.lotsCompleted).toBe(10);
    const who = openers.map((o) => o.split(":")[1]);
    for (let i = 1; i < who.length; i++) expect(who[i]).not.toBe(who[i - 1]);
    const match = await prisma.match.findUnique({ where: { code } });
    expect(match?.status).toBe("FINISHED");
    expect(match?.endReason).toBe("COMPLETED");
  });

  it("skips a character only when both players vote, and keeps the opening turn", async () => {
    const { a, b, code, snap } = await startedMatch();
    // Lot 1 (no bids): both skip.
    let s = await act(code, a, { action: "skip" });
    expect(s.currentLot?.skipVotes).toEqual([a]);
    expect(s.currentLot?.status).toBe("ACTIVE");
    const poolBefore = s.poolRemaining;
    s = await act(code, b, { action: "skip" });
    expect(s.currentLot).toMatchObject({ status: "UNSOLD", skipped: true });
    expect(s.history[0]).toMatchObject({ skipped: true, status: "UNSOLD" });
    expect(s.poolRemaining).toBe(poolBefore); // skipped characters do not come back
    expect(snap.currentLot!.id).toBe(s.history[0].id);

    // Lot 2 is free too; B opens, A outbids and B lets it go → A must open lot 3.
    s = (await tick(code, [a, b], 3000))!;
    let lot = s.currentLot!;
    expect(lot.lotNumber).toBe(2);
    await act(code, b, { action: "bid", lotId: lot.id, amount: lot.startingPrice });
    // Once a real bid is in, skipping is off.
    expect((await failure(act(code, a, { action: "skip" }))).key).toBe("SKIP_AFTER_BID");
    s = (await tick(code, [a, b], 16_000))!;
    expect(s.nextOpenerId).toBe(a);
    lot = s.currentLot!;
    expect(lot).toMatchObject({ lotNumber: 3, forcedOpenerId: a, highestBidderId: a });
    const balanceA = teamOf(s, a).balance;

    // Both skip the forced lot: A's automatic bid is withdrawn and A still owes the next opening.
    await act(code, b, { action: "skip" });
    s = await act(code, a, { action: "skip" });
    expect(s.currentLot).toMatchObject({ skipped: true, highestBid: null, bids: [] });
    expect(teamOf(s, a).balance).toBe(balanceA);
    s = (await tick(code, [a, b], 3000))!;
    expect(s.currentLot).toMatchObject({ lotNumber: 4, forcedOpenerId: a });
  });

  it("gives free characters to a player who ran out of money, then lets the other finish alone", async () => {
    const { a, b, code, snap } = await startedMatch();
    const lot = snap.currentLot!;
    // A spends everything on lot 1.
    await act(code, a, { action: "bid", lotId: lot.id, amount: 20 });
    let s = (await tick(code, [a, b], 11_000))!;
    expect(teamOf(s, a).balance).toBe(0);

    // The rest of A's team is assigned for free; B buys the rest on their own (and can't be outbid).
    let triedFullBid = false;
    s = await playOut(code, a, b, async (x) => {
      const l = x.currentLot;
      if (!triedFullBid && x.phase === "BIDDING" && l && teamOf(x, a).wonCharacterIds.length === 5) {
        triedFullBid = true;
        expect((await failure(act(code, a, { action: "bid", lotId: l.id, amount: l.startingPrice + 1 }))).code).toBe("TEAM_FULL");
      }
    });
    expect(triedFullBid).toBe(true);
    const free = s.history.filter((h) => h.autoAssigned);
    expect(free).toHaveLength(4);
    expect(free.every((h) => h.winnerId === a && h.finalPrice === 0)).toBe(true);
    expect(teamOf(s, a).wonCharacterIds).toHaveLength(5);
    expect(teamOf(s, a).balance).toBe(0);
    expect(teamOf(s, b).wonCharacterIds).toHaveLength(5);
    expect(s.history.filter((h) => h.status === "SOLD")).toHaveLength(10);
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
    const { a, b, code } = await startedMatch();
    let s = await playOut(code, a, b);
    expect(s.result?.detail.decision).toBeTruthy();
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
