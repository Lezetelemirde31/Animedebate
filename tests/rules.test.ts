import { describe, expect, it } from "vitest";
import {
  applyOvertime,
  buildPool,
  decideMatchWinner,
  generateRoomCode,
  minimumNextBid,
  normalizeRoomCode,
  returnToPool,
  validateBid,
} from "@/game/rules";
import { ROOM_CODE_ALPHABET } from "@/game/config";

const lot = { id: "lot1", startingPrice: 1, highestBid: null as number | null, highestBidderId: null as string | null, endsAt: 10_000 };
const base = { phase: "BIDDING" as const, now: 5_000, lot, lotId: "lot1", bidderId: "a", isPlayer: true, balance: 20, minIncrement: 1 };

describe("validateBid", () => {
  it("accepts an opening bid at the starting price", () => {
    expect(validateBid({ ...base, amount: 1 })).toEqual({ ok: true, amount: 1 });
  });

  it("rejects bids below the minimum increment", () => {
    const res = validateBid({ ...base, lot: { ...lot, highestBid: 5, highestBidderId: "b" }, amount: 5 });
    expect(res).toMatchObject({ ok: false, code: "BELOW_MINIMUM" });
  });

  it("rejects an equal bid (tie rule: first to reach a price holds it)", () => {
    const res = validateBid({ ...base, lot: { ...lot, highestBid: 7, highestBidderId: "b" }, amount: 7 });
    expect(res.ok).toBe(false);
  });

  it("rejects bids larger than the bidder's balance", () => {
    const res = validateBid({ ...base, balance: 4, amount: 5 });
    expect(res).toMatchObject({ ok: false, code: "INSUFFICIENT_BALANCE" });
  });

  it("rejects raising your own winning bid", () => {
    const res = validateBid({ ...base, lot: { ...lot, highestBid: 3, highestBidderId: "a" }, amount: 4 });
    expect(res).toMatchObject({ ok: false, code: "ALREADY_HIGHEST" });
  });

  it("rejects non-integer and non-numeric amounts", () => {
    for (const amount of [1.5, "5", NaN, Infinity, -1, 0, null]) {
      expect(validateBid({ ...base, amount }).ok).toBe(false);
    }
  });

  it("rejects bids after the timer ran out", () => {
    expect(validateBid({ ...base, now: 10_000, amount: 2 })).toMatchObject({ ok: false, code: "TIME_UP" });
  });

  it("rejects bids for a stale lot, outside bidding, or from spectators", () => {
    expect(validateBid({ ...base, lotId: "old", amount: 2 })).toMatchObject({ code: "LOT_MISMATCH" });
    expect(validateBid({ ...base, phase: "INTERMISSION", amount: 2 })).toMatchObject({ code: "NOT_BIDDING" });
    expect(validateBid({ ...base, isPlayer: false, amount: 2 })).toMatchObject({ code: "NOT_A_PLAYER" });
  });
});

describe("helpers", () => {
  it("computes the minimum next bid", () => {
    expect(minimumNextBid({ startingPrice: 3, highestBid: null }, 1)).toBe(3);
    expect(minimumNextBid({ startingPrice: 3, highestBid: 6 }, 1)).toBe(7);
  });

  it("extends the clock on late bids (overtime)", () => {
    expect(applyOvertime(10_000, 9_000, 6)).toEqual({ endsAt: 15_000, overtime: true });
    expect(applyOvertime(30_000, 9_000, 6)).toEqual({ endsAt: 30_000, overtime: false });
  });

  it("decides winners by score, then money left, else draw", () => {
    expect(decideMatchWinner([{ userId: "a", score: 9, balance: 0 }, { userId: "b", score: 5, balance: 20 }]).winnerId).toBe("a");
    expect(decideMatchWinner([{ userId: "a", score: 5, balance: 2 }, { userId: "b", score: 5, balance: 3 }]).winnerId).toBe("b");
    expect(decideMatchWinner([{ userId: "a", score: 5, balance: 3 }, { userId: "b", score: 5, balance: 3 }]).winnerId).toBeNull();
  });

  it("generates and normalises room codes", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    expect(normalizeRoomCode(` ${code.toLowerCase()} `)).toBe(code);
    expect(normalizeRoomCode("ABC")).toBeNull();
    expect(normalizeRoomCode("ABCDE0")).toBeNull();
  });

  it("puts characters nobody owns first in the pool", () => {
    const owned = new Map([["x", 2], ["y", 1]]);
    const pool = buildPool(["x", "y", "z", "w"], (id) => owned.get(id) ?? 0);
    expect(pool.slice(0, 2).sort()).toEqual(["w", "z"]);
    expect(pool[2]).toBe("y");
    expect(pool[3]).toBe("x");
  });

  it("never returns an unsold character as the very next lot", () => {
    for (let i = 0; i < 50; i++) {
      const pool = returnToPool(["a", "b", "c"], "z");
      expect(pool).toHaveLength(4);
      expect(pool[0]).not.toBe("z");
    }
    expect(returnToPool([], "z")).toEqual(["z"]);
  });
});
