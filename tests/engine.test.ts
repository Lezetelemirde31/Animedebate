import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CharacterCatalog } from "@/server/catalog";
import { EngineError, MatchEngine } from "@/server/engine";
import type { Persistence } from "@/server/persistence";
import type { CharacterDTO, RoomEvent, RoomSnapshot } from "@/game/types";
import type { Rarity } from "@/game/rarity";

function character(id: string, rarity: Rarity = "COMMON"): CharacterDTO {
  return {
    id,
    name: id.toUpperCase(),
    title: "",
    animeId: "naruto",
    animeName: "Naruto",
    imageUrl: null,
    description: "",
    abilities: [],
    rarity,
    powerLevel: 50,
  };
}

function memoryPersistence() {
  const balances = new Map<string, number>();
  const owned = new Map<string, number>();
  let lotSeq = 0;
  let bidSeq = 0;
  const calls: string[] = [];
  const p: Persistence = {
    createMatch: async () => ({ matchId: "m1", code: "ABCDEF" }),
    addPlayer: async (_m, userId, _seat, balance) => {
      balances.set(userId, balance);
    },
    removePlayer: async () => undefined,
    setHost: async () => undefined,
    markStarted: async () => {
      calls.push("started");
    },
    createLot: async () => `lot${++lotSeq}`,
    recordBid: async () => ({ id: `bid${++bidSeq}`, at: Date.now() }),
    settleSold: async ({ winnerId, price, characterId }) => {
      const bal = balances.get(winnerId) ?? 20;
      if (bal < price) throw new Error("negative balance");
      balances.set(winnerId, bal - price);
      owned.set(`${winnerId}:${characterId}`, (owned.get(`${winnerId}:${characterId}`) ?? 0) + 1);
      calls.push(`sold:${characterId}:${winnerId}:${price}`);
    },
    settleUnsold: async (lotId) => {
      calls.push(`unsold:${lotId}`);
    },
    cancelLot: async () => undefined,
    finishMatch: async ({ status, winnerId, endReason }) => {
      calls.push(`finish:${status}:${endReason}:${winnerId}`);
    },
    getProfiles: async (ids) => ids.map((id) => ({ userId: id, username: id, avatar: { style: "violet", imageUrl: null } })),
    getOwnerCounts: async () => new Map(),
  };
  return { p, balances, owned, calls };
}

const TIMING = {
  startCountdownMs: 1000,
  intermissionMs: 1000,
  reconnectGraceMs: 10_000,
  lobbySeatGraceMs: 5_000,
  minResumeMs: 4_000,
  unopposedCloseMs: 500,
};

function setup(opts: { totalLots?: number; chars?: CharacterDTO[] } = {}) {
  const mem = memoryPersistence();
  const catalog = new CharacterCatalog();
  catalog.set(opts.chars ?? ["a", "b", "c", "d", "e", "f"].map((id) => character(id)));
  let last: RoomSnapshot | null = null;
  const events: RoomEvent[] = [];
  const engine = new MatchEngine(
    {
      persistence: mem.p,
      catalog,
      publish: (_e, s) => {
        last = s;
      },
      emit: (_e, ev) => events.push(ev),
      timing: TIMING,
      log: () => undefined,
    },
    {
      matchId: "m1",
      code: "ABCDEF",
      isPrivate: true,
      isMatchmade: false,
      hostId: null,
      settings: {
        totalLots: opts.totalLots ?? 3,
        bidSeconds: 10,
        startingBalance: 20,
        minIncrement: 1,
        overtimeSeconds: 3,
        animeIds: ["naruto"],
      },
      players: [],
    },
  );
  const snap = () => engine.snapshot();
  return { engine, mem, events, snap, last: () => last };
}

async function startMatch(engine: MatchEngine) {
  const profile = (id: string) => ({ userId: id, username: id, avatar: { style: "violet", imageUrl: null } });
  await engine.join(profile("alice"));
  await engine.join(profile("bob"));
  await engine.attachSocket("alice", "s-alice");
  await engine.attachSocket("bob", "s-bob");
  await engine.setReady("alice", true);
  await engine.setReady("bob", true);
  expect(engine.phase).toBe("COUNTDOWN");
  await vi.advanceTimersByTimeAsync(TIMING.startCountdownMs + 10);
  expect(engine.phase).toBe("BIDDING");
}

describe("MatchEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a full match: bids, deductions, ownership and a winner", async () => {
    const { engine, mem, snap } = setup({ totalLots: 2 });
    await startMatch(engine);

    let lot = snap().currentLot!;
    await engine.bid("alice", lot.id, 1);
    await engine.bid("bob", lot.id, 4);
    await expect(engine.bid("bob", lot.id, 5)).rejects.toMatchObject({ code: "ALREADY_HIGHEST" });
    await engine.bid("alice", lot.id, 6);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(engine.phase).toBe("INTERMISSION");
    let s = snap();
    expect(s.currentLot!.status).toBe("SOLD");
    expect(s.players.find((p) => p.userId === "alice")!.balance).toBe(14);
    expect(s.players.find((p) => p.userId === "bob")!.balance).toBe(20);
    expect(mem.balances.get("alice")).toBe(14);

    await vi.advanceTimersByTimeAsync(TIMING.intermissionMs + 10);
    expect(engine.phase).toBe("BIDDING");
    lot = snap().currentLot!;
    expect(lot.lotNumber).toBe(2);
    await engine.bid("bob", lot.id, 3);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(TIMING.intermissionMs + 10);

    s = snap();
    expect(engine.phase).toBe("FINISHED");
    expect(s.history).toHaveLength(2);
    expect(s.players.find((p) => p.userId === "bob")!.balance).toBe(17);
    // Equal scores (two commons) → more money left wins.
    expect(s.result!.winnerId).toBe("bob");
    expect(mem.calls.some((c) => c.startsWith("finish:FINISHED:COMPLETED:bob"))).toBe(true);
  });

  it("returns unsold characters to the pool", async () => {
    const { engine, snap, mem } = setup();
    await startMatch(engine);
    const before = snap();
    const charId = before.currentLot!.character.id;
    const poolBefore = before.poolRemaining;
    await vi.advanceTimersByTimeAsync(10_000);
    const after = snap();
    expect(after.currentLot!.status).toBe("UNSOLD");
    expect(after.poolRemaining).toBe(poolBefore + 1);
    expect(mem.calls.some((c) => c.startsWith("unsold:"))).toBe(true);
    expect(after.history[0].character.id).toBe(charId);
  });

  it("never lets a bid exceed the bidder's balance", async () => {
    const { engine, snap } = setup();
    await startMatch(engine);
    const lot = snap().currentLot!;
    await expect(engine.bid("alice", lot.id, 21)).rejects.toBeInstanceOf(EngineError);
    await expect(engine.bid("mallory", lot.id, 1)).rejects.toMatchObject({ code: "NOT_A_PLAYER" });
    await expect(engine.bid("alice", lot.id, 2.5)).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("serialises simultaneous equal bids: the first one wins the tie", async () => {
    const { engine, snap } = setup();
    await startMatch(engine);
    const lot = snap().currentLot!;
    const results = await Promise.allSettled([engine.bid("alice", lot.id, 5), engine.bid("bob", lot.id, 5)]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(snap().currentLot!.highestBidderId).toBe("alice");
  });

  it("extends the timer when a bid lands in overtime", async () => {
    const { engine, snap, events } = setup();
    await startMatch(engine);
    const lot = snap().currentLot!;
    await vi.advanceTimersByTimeAsync(9_000);
    await engine.bid("alice", lot.id, 1);
    const endsAt = snap().currentLot!.endsAt!;
    expect(endsAt - Date.now()).toBeGreaterThanOrEqual(2_900);
    expect(events.some((e) => e.type === "bid" && e.overtime)).toBe(true);
  });

  it("closes quickly when the opponent cannot afford to counter", async () => {
    const { engine, snap } = setup();
    await startMatch(engine);
    const lot = snap().currentLot!;
    await engine.bid("alice", lot.id, 20);
    expect(snap().currentLot!.endsAt! - Date.now()).toBeLessThanOrEqual(TIMING.unopposedCloseMs);
    await vi.advanceTimersByTimeAsync(TIMING.unopposedCloseMs + 10);
    expect(snap().currentLot!.status).toBe("SOLD");
  });

  it("pauses on disconnect and resumes with time on the clock", async () => {
    const { engine, snap } = setup();
    await startMatch(engine);
    await vi.advanceTimersByTimeAsync(9_500);
    await engine.detachSocket("bob", "s-bob");
    expect(engine.phase).toBe("PAUSED");
    expect(snap().currentLot!.endsAt).toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(engine.phase).toBe("PAUSED");
    await engine.attachSocket("bob", "s-bob-2");
    expect(engine.phase).toBe("BIDDING");
    expect(snap().currentLot!.endsAt! - Date.now()).toBeGreaterThanOrEqual(TIMING.minResumeMs);
  });

  it("awards a forfeit win when a player does not come back", async () => {
    const { engine, snap, mem } = setup();
    await startMatch(engine);
    await engine.detachSocket("bob", "s-bob");
    await vi.advanceTimersByTimeAsync(TIMING.reconnectGraceMs + 50);
    expect(engine.phase).toBe("FINISHED");
    expect(snap().result).toMatchObject({ winnerId: "alice", reason: "FORFEIT" });
    expect(mem.calls.some((c) => c === "finish:FINISHED:FORFEIT:alice")).toBe(true);
  });

  it("abandons the match when both players disconnect", async () => {
    const { engine, snap } = setup();
    await startMatch(engine);
    await engine.detachSocket("bob", "s-bob");
    await engine.detachSocket("alice", "s-alice");
    await vi.advanceTimersByTimeAsync(TIMING.reconnectGraceMs + 50);
    expect(engine.phase).toBe("ABANDONED");
    expect(snap().result!.winnerId).toBeNull();
  });

  it("leaving a live match forfeits it", async () => {
    const { engine, snap } = setup();
    await startMatch(engine);
    await engine.leave("alice");
    expect(snap().result).toMatchObject({ winnerId: "bob", reason: "FORFEIT" });
  });

  it("frees a lobby seat when its owner never connects", async () => {
    const { engine } = setup();
    await engine.join({ userId: "alice", username: "alice", avatar: { style: "violet", imageUrl: null } });
    await engine.attachSocket("alice", "s1");
    await engine.join({ userId: "bob", username: "bob", avatar: { style: "violet", imageUrl: null } });
    expect(engine.playerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(TIMING.lobbySeatGraceMs + 10);
    expect(engine.playerCount()).toBe(1);
    expect(engine.hostId).toBe("alice");
  });

  it("skips characters nobody can afford and ends when the pool runs dry", async () => {
    const { engine, snap } = setup({ chars: [character("cheap", "COMMON"), character("pricey", "MYTHIC")], totalLots: 5 });
    await startMatch(engine);
    const first = snap().currentLot!;
    await engine.bid("alice", first.id, first.startingPrice);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(TIMING.intermissionMs + 10);
    // second lot is whichever remains
    const second = snap().currentLot!;
    expect(second.character.id).not.toBe(first.character.id);
    await engine.bid("bob", second.id, second.startingPrice);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(TIMING.intermissionMs + 10);
    expect(engine.phase).toBe("FINISHED");
    expect(snap().result!.reason).toBe("POOL_EXHAUSTED");
  });
});
