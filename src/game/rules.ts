/**
 * Pure, deterministic auction rules shared by the server engine (authoritative)
 * and the client (UI hints only). Covered by tests/rules.test.ts.
 */
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./config";
import { RARITY_INFO, type Rarity } from "./rarity";
import type { ErrorCode, Phase } from "./types";

export interface BiddableLot {
  id: string;
  startingPrice: number;
  highestBid: number | null;
  highestBidderId: string | null;
  endsAt: number | null;
}

/** The lowest amount the next bid may be. */
export function minimumNextBid(lot: Pick<BiddableLot, "startingPrice" | "highestBid">, minIncrement: number): number {
  return lot.highestBid === null ? lot.startingPrice : lot.highestBid + minIncrement;
}

export function canAffordNextBid(
  balance: number,
  lot: Pick<BiddableLot, "startingPrice" | "highestBid">,
  minIncrement: number,
): boolean {
  return balance >= minimumNextBid(lot, minIncrement);
}

/**
 * A rejected bid carries an error code plus the message key (under
 * `errors.*`) and values to show the player in their own language.
 */
export type BidCheck =
  | { ok: true; amount: number }
  | { ok: false; code: ErrorCode; key: string; params?: Record<string, number> };

export interface BidValidationInput {
  phase: Phase;
  now: number;
  lot: BiddableLot | null;
  lotId: string;
  bidderId: string;
  isPlayer: boolean;
  balance: number;
  amount: unknown;
  minIncrement: number;
}

export function validateBid(input: BidValidationInput): BidCheck {
  const { phase, now, lot, lotId, bidderId, isPlayer, balance, amount, minIncrement } = input;
  const fail = (code: ErrorCode, key: string = code, params?: Record<string, number>): BidCheck => ({ ok: false, code, key, params });
  if (!isPlayer) return fail("NOT_A_PLAYER");
  if (phase !== "BIDDING" || !lot) return fail("NOT_BIDDING");
  if (lot.id !== lotId) return fail("LOT_MISMATCH");
  if (lot.endsAt === null || now >= lot.endsAt) return fail("TIME_UP");
  if (typeof amount !== "number" || !Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    return fail("INVALID_AMOUNT");
  }
  if (lot.highestBidderId === bidderId) return fail("ALREADY_HIGHEST");
  const min = minimumNextBid(lot, minIncrement);
  if (amount < min) {
    return lot.highestBid === null
      ? fail("BELOW_MINIMUM", "BELOW_OPENING", { min })
      : fail("BELOW_MINIMUM", "BELOW_MINIMUM", { current: lot.highestBid, increment: minIncrement, min });
  }
  if (amount > balance) return fail("INSUFFICIENT_BALANCE", "INSUFFICIENT_BALANCE", { balance });
  return { ok: true, amount };
}

/**
 * Anti-sniping overtime: if a bid lands with less than `overtimeSeconds`
 * left, the clock is reset to `overtimeSeconds`.
 */
export function applyOvertime(endsAt: number, now: number, overtimeSeconds: number): { endsAt: number; overtime: boolean } {
  const floor = now + overtimeSeconds * 1000;
  if (endsAt < floor) return { endsAt: floor, overtime: true };
  return { endsAt, overtime: false };
}

export function scoreForRarity(rarity: Rarity): number {
  return RARITY_INFO[rarity].points;
}

export function startingPriceFor(rarity: Rarity): number {
  return RARITY_INFO[rarity].startingPrice;
}

export interface Standing {
  userId: string;
  score: number;
  balance: number;
}

/** How a finished match was decided (rendered in the reader's language). */
export type WinnerDetail =
  | { kind: "score"; high: number; low: number }
  | { kind: "balance"; score: number; balance: number }
  | { kind: "tie"; score: number; balance: number }
  | { kind: "single" };

/**
 * Decides the match winner: highest collection score wins; ties go to the
 * player with more money left; otherwise it is a draw.
 */
export function decideMatchWinner(players: Standing[]): { winnerId: string | null; detail: WinnerDetail } {
  if (players.length < 2) return { winnerId: players[0]?.userId ?? null, detail: { kind: "single" } };
  const [a, b] = players;
  if (a.score !== b.score) {
    const w = a.score > b.score ? a : b;
    return { winnerId: w.userId, detail: { kind: "score", high: Math.max(a.score, b.score), low: Math.min(a.score, b.score) } };
  }
  if (a.balance !== b.balance) {
    const w = a.balance > b.balance ? a : b;
    return { winnerId: w.userId, detail: { kind: "balance", score: a.score, balance: w.balance } };
  }
  return { winnerId: null, detail: { kind: "tie", score: a.score, balance: a.balance } };
}

export function generateRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Builds the auction pool for a match. Characters neither player owns come
 * first so matches favour new collectibles; everything is shuffled within
 * its tier.
 */
export function buildPool(
  characterIds: string[],
  ownerCount: (id: string) => number,
  random: () => number = Math.random,
): string[] {
  const tiers: string[][] = [[], [], []];
  for (const id of characterIds) tiers[Math.min(2, Math.max(0, ownerCount(id)))].push(id);
  return tiers.flatMap((t) => shuffle(t, random));
}

/**
 * Re-inserts an unsold character into the pool at a random position that is
 * not the very next lot, so the same character does not immediately reappear.
 */
export function returnToPool(pool: string[], characterId: string, random: () => number = Math.random): string[] {
  const next = pool.slice();
  if (next.length === 0) return [characterId];
  const min = Math.min(1, next.length);
  const idx = min + Math.floor(random() * (next.length - min + 1));
  next.splice(idx, 0, characterId);
  return next;
}
