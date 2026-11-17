/**
 * Database-authoritative auction engine.
 *
 * All live state (phase, timers, pool, balances, bids, presence) lives in the
 * database. Every request takes the room's lock, loads the room, "catches up"
 * the auction to the current time by replaying due events in chronological
 * order (lot closes, intermissions, pauses, forfeits…), applies the requested
 * action and saves. Because nothing lives in process memory, any server
 * instance can serve any request — including serverless functions (Vercel) —
 * and a restart never loses a match.
 *
 *   LOBBY ─(both ready)→ COUNTDOWN → BIDDING ⇄ INTERMISSION → FINISHED
 *   live phases ─(player stops checking in)→ PAUSED ─(back)→ resume
 *                                              └─(grace over)→ FINISHED (forfeit) / ABANDONED
 *
 * Only simple Prisma calls are used so the same code also runs on the
 * in-memory preview store (no database configured).
 */
import type { Prisma } from "@prisma/client";
import { GAME_RULES } from "@/game/config";
import {
  applyOvertime,
  buildPool,
  canAffordNextBid,
  decideMatchWinner,
  generateRoomCode,
  returnToPool,
  scoreForRarity,
  startingPriceFor,
  validateBid,
} from "@/game/rules";
import type {
  AvatarDTO,
  BidDTO,
  ErrorCode,
  LotState,
  LotSummary,
  MatchResultDetail,
  MatchResultState,
  Phase,
  RoomSettings,
  RoomSnapshot,
} from "@/game/types";
import type { Catalog } from "../catalog";

export type Tx = Prisma.TransactionClient;

/**
 * A rejected action. `key` selects the message shown to the player (see
 * `apiErrors` in the message files); `params` fill in its values.
 */
export class EngineError extends Error {
  readonly key: string;
  constructor(
    public code: ErrorCode,
    key?: string,
    public params?: Record<string, string | number>,
    public data?: { code?: string; matchId?: string },
  ) {
    super(key ?? code);
    this.key = key ?? code;
  }
}

export interface Timing {
  startCountdownMs: number;
  intermissionMs: number;
  reconnectGraceMs: number;
  lobbySeatGraceMs: number;
  minResumeMs: number;
  unopposedCloseMs: number;
  presenceTimeoutMs: number;
}

export const DEFAULT_TIMING: Timing = {
  startCountdownMs: GAME_RULES.startCountdownMs,
  intermissionMs: GAME_RULES.intermissionMs,
  reconnectGraceMs: GAME_RULES.reconnectGraceMs,
  lobbySeatGraceMs: GAME_RULES.lobbySeatGraceMs,
  minResumeMs: GAME_RULES.minResumeMs,
  unopposedCloseMs: GAME_RULES.unopposedCloseMs,
  presenceTimeoutMs: GAME_RULES.presenceTimeoutMs,
};

export interface PlayerS {
  rowId: string;
  userId: string;
  username: string;
  avatar: AvatarDTO;
  seat: number;
  balance: number;
  score: number;
  ready: boolean;
  lastSeenAt: number | null;
  joinedAt: number;
  wonCharacterIds: string[];
}

export interface LotS {
  id: string;
  lotNumber: number;
  characterId: string;
  startingPrice: number;
  highestBid: number | null;
  highestBidderId: string | null;
  bids: BidDTO[];
  startedAt: number;
  endsAt: number | null;
  status: LotState["status"];
  winnerId: string | null;
  finalPrice: number | null;
}

export interface RoomS {
  id: string;
  code: string;
  isPrivate: boolean;
  isMatchmade: boolean;
  hostId: string | null;
  settings: RoomSettings;
  createdAt: number;
  status: "WAITING" | "IN_PROGRESS" | "FINISHED" | "ABANDONED";
  phase: Phase;
  phaseEndsAt: number | null;
  pausedPhase: Phase | null;
  pausedRemainingMs: number;
  pool: string[];
  lotsCompleted: number;
  version: number;
  rematchVotes: string[];
  rematchCode: string | null;
  winnerId: string | null;
  endReason: string | null;
  resultDetail: MatchResultDetail;
  players: PlayerS[];
  lot: LotS | null;
  /** Set whenever room state changed and the version must be bumped. */
  dirty: boolean;
  /** Follow-up work to run after the room was saved (XP, badges…). */
  after: (() => Promise<unknown>)[];
}

/** Things that happen as a result of the auction, handled outside the engine. */
export interface EngineHooks {
  lotWon?(input: { userId: string; lotId: string; matchId: string }): Promise<unknown>;
  matchFinished?(input: { matchId: string; playerIds: string[]; winnerId: string | null }): Promise<unknown>;
}

export interface Ctx {
  tx: Tx;
  catalog: Catalog;
  timing: Timing;
  random: () => number;
  hooks?: EngineHooks;
}

const LIVE: Phase[] = ["COUNTDOWN", "BIDDING", "INTERMISSION", "PAUSED"];
export const isLivePhase = (p: Phase) => LIVE.includes(p);
export const isEndedPhase = (p: Phase) => p === "FINISHED" || p === "ABANDONED";

const ms = (d: Date | null | undefined) => (d ? new Date(d).getTime() : null);
const date = (t: number | null) => (t === null ? null : new Date(t));

function parseDetail(raw: string | null | undefined): MatchResultDetail {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as MatchResultDetail) : {};
  } catch {
    return {};
  }
}

interface UserAvatarFields {
  avatarStyle: string;
  avatarCustomUrl?: string | null;
  avatarCharacter?: { imageUrl: string | null } | null;
}

export function avatarOf(u: UserAvatarFields): AvatarDTO {
  return { style: u.avatarStyle, imageUrl: u.avatarCustomUrl ?? u.avatarCharacter?.imageUrl ?? null };
}

const userWithAvatar = { include: { avatarCharacter: { select: { imageUrl: true } } } } as const;

// ─── Load / save ────────────────────────────────────────────────────────────

export async function loadRoom(tx: Tx, matchId: string): Promise<RoomS | null> {
  const m = await tx.match.findUnique({ where: { id: matchId } });
  if (!m) return null;
  const [players, latest, sold] = await Promise.all([
    tx.matchPlayer.findMany({ where: { matchId }, orderBy: { seat: "asc" }, include: { user: userWithAvatar } }),
    tx.auctionLot.findFirst({
      where: { matchId },
      orderBy: { lotNumber: "desc" },
      include: { bids: { orderBy: { createdAt: "asc" }, include: { user: { select: { username: true } } } } },
    }),
    tx.auctionLot.findMany({ where: { matchId, status: "SOLD" }, orderBy: { lotNumber: "asc" } }),
  ]);
  return {
    id: m.id,
    code: m.code,
    isPrivate: m.isPrivate,
    isMatchmade: m.isMatchmade,
    hostId: m.hostId,
    settings: {
      totalLots: m.totalLots,
      bidSeconds: m.bidSeconds,
      startingBalance: m.startingBalance,
      minIncrement: m.minIncrement,
      overtimeSeconds: GAME_RULES.overtimeSeconds,
      animeIds: m.animeIds,
    },
    createdAt: new Date(m.createdAt).getTime(),
    status: m.status,
    phase: m.phase,
    phaseEndsAt: ms(m.phaseEndsAt),
    pausedPhase: m.pausedPhase,
    pausedRemainingMs: m.pausedRemainingMs ?? 0,
    pool: [...(m.pool ?? [])],
    lotsCompleted: m.lotsCompleted,
    version: m.version,
    rematchVotes: [...(m.rematchVotes ?? [])],
    rematchCode: m.rematchCode ?? null,
    winnerId: m.winnerId ?? null,
    endReason: m.endReason ?? null,
    resultDetail: parseDetail(m.resultDetail),
    players: players.map((p) => ({
      rowId: p.id,
      userId: p.userId,
      username: p.user.username,
      avatar: avatarOf(p.user),
      seat: p.seat,
      balance: p.balance,
      score: p.score,
      ready: p.ready,
      lastSeenAt: ms(p.lastSeenAt),
      joinedAt: new Date(p.joinedAt).getTime(),
      wonCharacterIds: sold.filter((l) => l.winnerId === p.userId).map((l) => l.characterId),
    })),
    lot: latest
      ? {
          id: latest.id,
          lotNumber: latest.lotNumber,
          characterId: latest.characterId,
          startingPrice: latest.startingPrice,
          highestBid: latest.highestBid ?? null,
          highestBidderId: latest.highestBidderId ?? null,
          bids: latest.bids.map((b) => ({
            id: b.id,
            userId: b.userId,
            username: b.user.username,
            amount: b.amount,
            at: new Date(b.createdAt).getTime(),
          })),
          startedAt: new Date(latest.startedAt).getTime(),
          endsAt: ms(latest.endsAt),
          status: latest.status,
          winnerId: latest.winnerId ?? null,
          finalPrice: latest.finalPrice ?? null,
        }
      : null,
    dirty: false,
    after: [],
  };
}

/** Writes the room's live state and bumps the version if anything changed. */
export async function saveRoom(tx: Tx, s: RoomS): Promise<void> {
  if (!s.dirty) return;
  s.version += 1;
  await tx.match.update({
    where: { id: s.id },
    data: {
      status: s.status,
      phase: s.phase,
      phaseEndsAt: date(s.phaseEndsAt),
      pausedPhase: s.pausedPhase,
      pausedRemainingMs: s.pausedRemainingMs,
      pool: s.pool,
      lotsCompleted: s.lotsCompleted,
      version: s.version,
      rematchVotes: s.rematchVotes,
      rematchCode: s.rematchCode,
      hostId: s.hostId,
    },
  });
  s.dirty = false;
}

// ─── Presence ───────────────────────────────────────────────────────────────

const seenAt = (p: PlayerS) => p.lastSeenAt ?? p.joinedAt;
export const isPresent = (p: PlayerS, t: number, timing: Timing) => seenAt(p) + timing.presenceTimeoutMs > t;

const HEARTBEAT_WRITE_MS = 2_000;

/** Records a heartbeat from a player's browser (written at most every 2 seconds). */
export async function heartbeat(ctx: Ctx, s: RoomS, userId: string, now: number): Promise<void> {
  const p = s.players.find((x) => x.userId === userId);
  if (!p) return;
  if (p.lastSeenAt !== null && now - p.lastSeenAt < HEARTBEAT_WRITE_MS && isPresent(p, now, ctx.timing)) return;
  p.lastSeenAt = now;
  await ctx.tx.matchPlayer.update({ where: { id: p.rowId }, data: { lastSeenAt: new Date(now) } });
}

// ─── Catch-up: replay due events in time order ──────────────────────────────

type Ev =
  | { at: number; kind: "seat_expire"; userId: string }
  | { at: number; kind: "start" }
  | { at: number; kind: "countdown_end" }
  | { at: number; kind: "lot_close" }
  | { at: number; kind: "intermission_end" }
  | { at: number; kind: "pause"; userId: string }
  | { at: number; kind: "resume" }
  | { at: number; kind: "pause_timeout" };

// When two events are due at the same instant, timers go first.
const PRIORITY: Record<Ev["kind"], number> = {
  countdown_end: 0,
  lot_close: 0,
  intermission_end: 0,
  pause_timeout: 0,
  seat_expire: 1,
  start: 2,
  pause: 3,
  resume: 4,
};

function nextEvent(s: RoomS, now: number, timing: Timing): Ev | null {
  const evs: Ev[] = [];
  switch (s.phase) {
    case "LOBBY": {
      for (const p of s.players) {
        if (!isPresent(p, now, timing)) evs.push({ at: seenAt(p) + timing.lobbySeatGraceMs, kind: "seat_expire", userId: p.userId });
      }
      if (s.players.length === GAME_RULES.maxPlayers && s.players.every((p) => p.ready && isPresent(p, now, timing))) {
        evs.push({ at: now, kind: "start" });
      }
      break;
    }
    case "COUNTDOWN":
    case "BIDDING":
    case "INTERMISSION": {
      for (const p of s.players) evs.push({ at: seenAt(p) + timing.presenceTimeoutMs, kind: "pause", userId: p.userId });
      if (s.phase === "COUNTDOWN" && s.phaseEndsAt !== null) evs.push({ at: s.phaseEndsAt, kind: "countdown_end" });
      if (s.phase === "INTERMISSION" && s.phaseEndsAt !== null) evs.push({ at: s.phaseEndsAt, kind: "intermission_end" });
      if (s.phase === "BIDDING" && s.lot?.endsAt != null) evs.push({ at: s.lot.endsAt, kind: "lot_close" });
      break;
    }
    case "PAUSED": {
      if (s.players.every((p) => isPresent(p, now, timing))) evs.push({ at: now, kind: "resume" });
      else if (s.phaseEndsAt !== null) evs.push({ at: s.phaseEndsAt, kind: "pause_timeout" });
      break;
    }
    default:
      return null;
  }
  const due = evs.filter((e) => e.at <= now).sort((a, b) => a.at - b.at || PRIORITY[a.kind] - PRIORITY[b.kind]);
  return due[0] ?? null;
}

/** Applies every event that became due up to `now`, oldest first. */
export async function advance(ctx: Ctx, s: RoomS, now: number): Promise<void> {
  for (let i = 0; i < 64; i++) {
    const ev = nextEvent(s, now, ctx.timing);
    if (!ev) return;
    switch (ev.kind) {
      case "seat_expire":
        await removeFromLobby(ctx, s, ev.userId, ev.at);
        break;
      case "start":
        await beginMatch(ctx, s, ev.at);
        break;
      case "countdown_end":
      case "intermission_end":
        await proceed(ctx, s, ev.at);
        break;
      case "lot_close":
        await closeLot(ctx, s, ev.at);
        break;
      case "pause":
        pause(ctx, s, ev.at);
        await persistLotTiming(ctx, s);
        break;
      case "resume":
        resume(ctx, s, now);
        await persistLotTiming(ctx, s);
        break;
      case "pause_timeout":
        await handlePauseTimeout(ctx, s, ev.at);
        break;
    }
  }
}

// ─── Transitions ────────────────────────────────────────────────────────────

async function persistLotTiming(ctx: Ctx, s: RoomS): Promise<void> {
  if (s.lot && s.lot.status === "ACTIVE") {
    await ctx.tx.auctionLot.update({ where: { id: s.lot.id }, data: { endsAt: date(s.lot.endsAt) } });
  }
}

async function removeFromLobby(ctx: Ctx, s: RoomS, userId: string, at: number): Promise<void> {
  const p = s.players.find((x) => x.userId === userId);
  if (!p) return;
  await ctx.tx.matchPlayer.delete({ where: { id: p.rowId } });
  s.players = s.players.filter((x) => x.userId !== userId);
  s.dirty = true;
  if (s.players.length === 0) {
    await finish(ctx, s, "ABANDONED", null, { note: "everyone_left" }, at);
    return;
  }
  if (s.hostId === userId) s.hostId = s.players[0].userId;
}

async function beginMatch(ctx: Ctx, s: RoomS, at: number): Promise<void> {
  const ids = ctx.catalog.idsForAnime(s.settings.animeIds);
  if (ids.length === 0) throw new EngineError("INVALID_STATE", "NO_CHARACTERS");
  const owners = await ctx.tx.ownedCharacter.groupBy({
    by: ["characterId"],
    where: { userId: { in: s.players.map((p) => p.userId) } },
    _count: { _all: true },
  });
  const ownerCount = new Map(owners.map((o) => [o.characterId, o._count._all]));
  s.pool = buildPool(ids, (id) => ownerCount.get(id) ?? 0, ctx.random);
  s.status = "IN_PROGRESS";
  s.phase = "COUNTDOWN";
  s.phaseEndsAt = at + ctx.timing.startCountdownMs;
  s.dirty = true;
  await ctx.tx.match.update({ where: { id: s.id }, data: { startedAt: new Date(at) } });
}

async function proceed(ctx: Ctx, s: RoomS, at: number): Promise<void> {
  if (s.lotsCompleted >= s.settings.totalLots) return finish(ctx, s, "COMPLETED", null, {}, at);
  if (s.players.every((p) => p.balance <= 0)) return finish(ctx, s, "COMPLETED", null, { note: "all_spent" }, at);
  await startNextLot(ctx, s, at);
}

async function startNextLot(ctx: Ctx, s: RoomS, at: number): Promise<void> {
  const idx = s.pool.findIndex((id) => {
    const rarity = ctx.catalog.rarity(id);
    return !!rarity && s.players.some((p) => p.balance >= startingPriceFor(rarity));
  });
  if (idx === -1) {
    const anyMoney = s.players.some((p) => p.balance > 0);
    return finish(ctx, s, anyMoney ? "POOL_EXHAUSTED" : "COMPLETED", null, { note: anyMoney ? "pool_empty" : "all_spent" }, at);
  }
  const characterId = s.pool[idx];
  const lotNumber = s.lotsCompleted + 1;
  const startingPrice = startingPriceFor(ctx.catalog.rarity(characterId)!);
  const endsAt = at + s.settings.bidSeconds * 1000;
  const row = await ctx.tx.auctionLot.create({
    data: { matchId: s.id, lotNumber, characterId, startingPrice, startedAt: new Date(at), endsAt: new Date(endsAt) },
  });
  s.pool = s.pool.filter((_, i) => i !== idx);
  s.lot = {
    id: row.id,
    lotNumber,
    characterId,
    startingPrice,
    highestBid: null,
    highestBidderId: null,
    bids: [],
    startedAt: at,
    endsAt,
    status: "ACTIVE",
    winnerId: null,
    finalPrice: null,
  };
  s.phase = "BIDDING";
  s.phaseEndsAt = null;
  s.dirty = true;
}

async function closeLot(ctx: Ctx, s: RoomS, at: number): Promise<void> {
  const lot = s.lot!;
  const { tx } = ctx;
  const rarity = ctx.catalog.rarity(lot.characterId) ?? "COMMON";
  if (lot.highestBidderId && lot.highestBid !== null) {
    const winner = s.players.find((p) => p.userId === lot.highestBidderId)!;
    const price = lot.highestBid;
    const points = scoreForRarity(rarity);
    const loserIds = [...new Set(lot.bids.map((b) => b.userId))].filter((id) => id !== winner.userId);
    // A lot can be settled only once…
    const updated = await tx.auctionLot.updateMany({
      where: { id: lot.id, status: "ACTIVE" },
      data: { status: "SOLD", winnerId: winner.userId, finalPrice: price, endsAt: null, endedAt: new Date(at) },
    });
    if (updated.count !== 1) throw new Error(`Lot ${lot.id} is not active`);
    // …and a sale can never take a balance below zero.
    const debit = await tx.matchPlayer.updateMany({
      where: { id: winner.rowId, balance: { gte: price } },
      data: { balance: { decrement: price }, score: { increment: points } },
    });
    if (debit.count !== 1) throw new Error(`Balance check failed for ${winner.userId}`);
    await tx.ownedCharacter.upsert({
      where: { userId_characterId: { userId: winner.userId, characterId: lot.characterId } },
      create: { userId: winner.userId, characterId: lot.characterId, lastPrice: price, totalSpent: price, sourceMatchId: s.id },
      update: {
        copies: { increment: 1 },
        lastPrice: price,
        totalSpent: { increment: price },
        lastAcquiredAt: new Date(at),
        sourceMatchId: s.id,
      },
    });
    await tx.user.update({ where: { id: winner.userId }, data: { auctionWins: { increment: 1 }, totalSpent: { increment: price } } });
    if (loserIds.length) await tx.user.updateMany({ where: { id: { in: loserIds } }, data: { auctionLosses: { increment: 1 } } });
    winner.balance -= price;
    winner.score += points;
    winner.wonCharacterIds.push(lot.characterId);
    lot.status = "SOLD";
    lot.winnerId = winner.userId;
    lot.finalPrice = price;
    const hook = ctx.hooks?.lotWon;
    if (hook) s.after.push(() => hook({ userId: winner.userId, lotId: lot.id, matchId: s.id }));
  } else {
    await tx.auctionLot.updateMany({
      where: { id: lot.id, status: "ACTIVE" },
      data: { status: "UNSOLD", endsAt: null, endedAt: new Date(at) },
    });
    lot.status = "UNSOLD";
    // Nobody bid: the character goes back into the pool.
    s.pool = returnToPool(s.pool, lot.characterId, ctx.random);
  }
  lot.endsAt = null;
  s.lotsCompleted += 1;
  s.phase = "INTERMISSION";
  s.phaseEndsAt = at + ctx.timing.intermissionMs;
  s.dirty = true;
}

function pause(ctx: Ctx, s: RoomS, at: number): void {
  const resumeAt = s.phase === "BIDDING" ? s.lot?.endsAt ?? at : s.phaseEndsAt ?? at;
  s.pausedPhase = s.phase;
  s.pausedRemainingMs = Math.max(0, resumeAt - at);
  if (s.phase === "BIDDING" && s.lot) s.lot.endsAt = null;
  s.phase = "PAUSED";
  s.phaseEndsAt = at + ctx.timing.reconnectGraceMs;
  s.dirty = true;
}

function resume(ctx: Ctx, s: RoomS, now: number): void {
  const phase = s.pausedPhase ?? "INTERMISSION";
  s.phase = phase;
  s.pausedPhase = null;
  if (phase === "BIDDING" && s.lot) {
    s.lot.endsAt = now + Math.max(s.pausedRemainingMs, ctx.timing.minResumeMs);
    s.phaseEndsAt = null;
  } else {
    s.phaseEndsAt = now + Math.max(s.pausedRemainingMs, 1500);
  }
  s.pausedRemainingMs = 0;
  s.dirty = true;
}

async function handlePauseTimeout(ctx: Ctx, s: RoomS, at: number): Promise<void> {
  const present = s.players.filter((p) => isPresent(p, at, ctx.timing));
  if (present.length === 0) return finish(ctx, s, "ABANDONED", null, { note: "both_disconnected" }, at);
  const gone = s.players.filter((p) => !present.includes(p));
  await finish(ctx, s, "FORFEIT", present[0].userId, { note: "no_reconnect", names: gone.map((g) => g.username) }, at);
}

export async function finish(
  ctx: Ctx,
  s: RoomS,
  reason: MatchResultState["reason"],
  forcedWinnerId: string | null,
  detail: MatchResultDetail,
  at: number,
): Promise<void> {
  if (isEndedPhase(s.phase)) return;
  const { tx } = ctx;
  let winnerId = forcedWinnerId;
  const explanation: MatchResultDetail = { ...detail };
  if (reason === "COMPLETED" || reason === "POOL_EXHAUSTED") {
    const decided = decideMatchWinner(s.players.map((p) => ({ userId: p.userId, score: p.score, balance: p.balance })));
    winnerId = decided.winnerId;
    explanation.decision = decided.detail;
  }
  const started = s.status === "IN_PROGRESS";
  const abandoned = reason === "ABANDONED";
  if (s.lot && s.lot.status === "ACTIVE") {
    await tx.auctionLot.update({ where: { id: s.lot.id }, data: { status: "CANCELLED", endsAt: null, endedAt: new Date(at) } });
    s.lot.status = "CANCELLED";
    s.lot.endsAt = null;
  }
  if (!abandoned) {
    // Stable order so two matches finishing at once can never deadlock on the same users.
    for (const p of [...s.players].sort((a, b) => a.userId.localeCompare(b.userId))) {
      const result = winnerId === null ? "DRAW" : p.userId === winnerId ? "WIN" : "LOSS";
      await tx.matchPlayer.update({ where: { id: p.rowId }, data: { result } });
      if (started) {
        await tx.user.update({
          where: { id: p.userId },
          data: { matchesPlayed: { increment: 1 }, matchesWon: { increment: result === "WIN" ? 1 : 0 } },
        });
      }
    }
    const hook = ctx.hooks?.matchFinished;
    if (hook && started) {
      const playerIds = s.players.map((p) => p.userId);
      s.after.push(() => hook({ matchId: s.id, playerIds, winnerId }));
    }
  }
  await tx.match.update({
    where: { id: s.id },
    data: { winnerId, endReason: reason, resultDetail: JSON.stringify(explanation), endedAt: new Date(at) },
  });
  s.status = abandoned ? "ABANDONED" : "FINISHED";
  s.phase = abandoned ? "ABANDONED" : "FINISHED";
  s.phaseEndsAt = null;
  s.pausedPhase = null;
  s.winnerId = winnerId;
  s.endReason = reason;
  s.resultDetail = explanation;
  s.dirty = true;
}

// ─── Player actions ─────────────────────────────────────────────────────────

/** Takes a free seat in the lobby. Returns false if the user can only spectate. */
export async function seatPlayer(ctx: Ctx, s: RoomS, userId: string, now: number): Promise<boolean> {
  if (s.players.some((p) => p.userId === userId)) return true;
  if (s.phase !== "LOBBY" || s.players.length >= GAME_RULES.maxPlayers) return false;
  const taken = new Set(s.players.map((p) => p.seat));
  const seat = [0, 1].find((x) => !taken.has(x))!;
  const row = await ctx.tx.matchPlayer.create({
    data: {
      matchId: s.id,
      userId,
      seat,
      balance: s.settings.startingBalance,
      score: 0,
      ready: false,
      lastSeenAt: new Date(now),
      joinedAt: new Date(now),
    },
    include: { user: userWithAvatar },
  });
  s.players.push({
    rowId: row.id,
    userId,
    username: row.user.username,
    avatar: avatarOf(row.user),
    seat,
    balance: row.balance,
    score: 0,
    ready: false,
    lastSeenAt: now,
    joinedAt: now,
    wonCharacterIds: [],
  });
  s.players.sort((a, b) => a.seat - b.seat);
  if (!s.hostId) s.hostId = userId;
  s.dirty = true;
  return true;
}

export async function leaveRoom(ctx: Ctx, s: RoomS, userId: string, now: number): Promise<void> {
  const p = s.players.find((x) => x.userId === userId);
  if (!p) return;
  if (s.phase === "LOBBY") {
    await removeFromLobby(ctx, s, userId, now);
  } else if (isLivePhase(s.phase)) {
    const other = s.players.find((x) => x.userId !== userId);
    await finish(ctx, s, "FORFEIT", other?.userId ?? null, { note: "left", names: [p.username] }, now);
  }
}

export async function setReady(ctx: Ctx, s: RoomS, userId: string, ready: boolean, now: number): Promise<void> {
  const p = s.players.find((x) => x.userId === userId);
  if (!p) throw new EngineError("NOT_A_PLAYER");
  if (s.phase !== "LOBBY") throw new EngineError("INVALID_STATE", "ALREADY_STARTED");
  p.ready = ready === true;
  await ctx.tx.matchPlayer.update({ where: { id: p.rowId }, data: { ready: p.ready } });
  s.dirty = true;
  await advance(ctx, s, now);
}

/**
 * Places a bid. `receivedAt` is when the request reached the server, so
 * waiting for the room lock never makes an on-time bid late.
 */
export async function placeBid(ctx: Ctx, s: RoomS, userId: string, lotId: string, amount: unknown, receivedAt: number): Promise<number> {
  const p = s.players.find((x) => x.userId === userId);
  const lot = s.lot;
  const check = validateBid({
    phase: s.phase,
    now: receivedAt,
    lot: lot && lot.status === "ACTIVE" ? lot : null,
    lotId,
    bidderId: userId,
    isPlayer: !!p,
    balance: p?.balance ?? 0,
    amount,
    minIncrement: s.settings.minIncrement,
  });
  if (!check.ok) throw new EngineError(check.code, check.key, check.params);
  const bid = await ctx.tx.bid.create({ data: { lotId: lot!.id, userId, amount: check.amount, createdAt: new Date(receivedAt) } });
  lot!.bids.push({ id: bid.id, userId, username: p!.username, amount: check.amount, at: receivedAt });
  lot!.highestBid = check.amount;
  lot!.highestBidderId = userId;
  lot!.endsAt = applyOvertime(lot!.endsAt!, receivedAt, s.settings.overtimeSeconds).endsAt;
  const opponents = s.players.filter((o) => o.userId !== userId);
  if (opponents.every((o) => !canAffordNextBid(o.balance, lot!, s.settings.minIncrement))) {
    lot!.endsAt = Math.min(lot!.endsAt, receivedAt + ctx.timing.unopposedCloseMs);
  }
  await ctx.tx.auctionLot.update({
    where: { id: lot!.id },
    data: { highestBid: check.amount, highestBidderId: userId, endsAt: date(lot!.endsAt) },
  });
  s.dirty = true;
  return check.amount;
}

/** Records a rematch vote; once everyone agreed, creates the new room. */
export async function voteRematch(ctx: Ctx, s: RoomS, userId: string, now: number): Promise<void> {
  if (!s.players.some((p) => p.userId === userId)) throw new EngineError("NOT_A_PLAYER");
  if (s.phase !== "FINISHED") throw new EngineError("INVALID_STATE", "NOT_FINISHED");
  if (s.rematchCode) return;
  if (s.players.length !== GAME_RULES.maxPlayers || !s.players.every((p) => isPresent(p, now, ctx.timing))) {
    throw new EngineError("INVALID_STATE", "OPPONENT_LEFT");
  }
  if (!s.rematchVotes.includes(userId)) s.rematchVotes = [...s.rematchVotes, userId];
  s.dirty = true;
  if (s.rematchVotes.length < s.players.length) return;
  s.rematchCode = await createRoomTx(ctx.tx, {
    hostId: s.hostId ?? s.players[0].userId,
    isPrivate: s.isPrivate,
    isMatchmade: s.isMatchmade,
    settings: s.settings,
    playerIds: s.players.map((p) => p.userId),
    now,
  });
}

// ─── Rooms ──────────────────────────────────────────────────────────────────

export async function createRoomTx(
  tx: Tx,
  input: { hostId: string; isPrivate: boolean; isMatchmade: boolean; settings: RoomSettings; playerIds: string[]; now: number; seenUserId?: string },
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    const exists = await tx.match.findUnique({ where: { code } });
    if (exists) continue;
    const match = await tx.match.create({
      data: {
        code,
        status: "WAITING",
        phase: "LOBBY",
        hostId: input.hostId,
        isPrivate: input.isPrivate,
        isMatchmade: input.isMatchmade,
        totalLots: input.settings.totalLots,
        bidSeconds: input.settings.bidSeconds,
        startingBalance: input.settings.startingBalance,
        minIncrement: input.settings.minIncrement,
        animeIds: input.settings.animeIds,
        pool: [],
        rematchVotes: [],
        lotsCompleted: 0,
        version: 0,
      },
    });
    for (const [seat, userId] of input.playerIds.entries()) {
      await tx.matchPlayer.create({
        data: {
          matchId: match.id,
          userId,
          seat,
          balance: input.settings.startingBalance,
          score: 0,
          ready: false,
          lastSeenAt: userId === input.seenUserId ? new Date(input.now) : null,
          joinedAt: new Date(input.now),
        },
      });
    }
    return code;
  }
  throw new Error("Could not allocate a unique room code");
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

export async function buildSnapshot(ctx: Ctx, s: RoomS, now: number): Promise<RoomSnapshot> {
  const { tx, catalog, timing } = ctx;
  const [historyRows, spectators] = await Promise.all([
    tx.auctionLot.findMany({
      where: { matchId: s.id, status: { in: ["SOLD", "UNSOLD"] } },
      orderBy: { lotNumber: "asc" },
      include: { _count: { select: { bids: true } } },
    }),
    tx.matchSpectator.count({ where: { matchId: s.id, lastSeenAt: { gte: new Date(now - timing.presenceTimeoutMs) } } }),
  ]);
  const history: LotSummary[] = historyRows.flatMap((l) => {
    const character = catalog.get(l.characterId);
    return character
      ? [{
          id: l.id,
          lotNumber: l.lotNumber,
          character,
          status: l.status as "SOLD" | "UNSOLD",
          winnerId: l.winnerId ?? null,
          finalPrice: l.finalPrice ?? null,
          bidCount: l._count.bids,
        }]
      : [];
  });
  const lot = s.lot;
  const character = lot ? catalog.get(lot.characterId) : undefined;
  const showLot = lot && character && s.phase !== "LOBBY";
  return {
    version: s.version,
    serverNow: now,
    matchId: s.id,
    code: s.code,
    phase: s.phase,
    isPrivate: s.isPrivate,
    isMatchmade: s.isMatchmade,
    hostId: s.hostId,
    settings: s.settings,
    players: s.players.map((p) => {
      const connected = isPresent(p, now, timing);
      return {
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        seat: p.seat,
        balance: p.balance,
        score: p.score,
        ready: p.ready,
        connected,
        isHost: p.userId === s.hostId,
        wonCharacterIds: [...p.wonCharacterIds],
        disconnectDeadline: connected
          ? null
          : s.phase === "LOBBY"
            ? seenAt(p) + timing.lobbySeatGraceMs
            : s.phase === "PAUSED"
              ? s.phaseEndsAt
              : null,
      };
    }),
    lotsCompleted: s.lotsCompleted,
    currentLot: showLot
      ? {
          id: lot.id,
          lotNumber: lot.lotNumber,
          character,
          startingPrice: lot.startingPrice,
          highestBid: lot.highestBid,
          highestBidderId: lot.highestBidderId,
          bids: lot.bids.slice(-50),
          startedAt: lot.startedAt,
          endsAt: lot.endsAt,
          status: lot.status,
          winnerId: lot.winnerId,
          finalPrice: lot.finalPrice,
        }
      : null,
    phaseEndsAt: s.phaseEndsAt,
    pausedPhase: s.pausedPhase,
    history,
    result: isEndedPhase(s.phase)
      ? { winnerId: s.winnerId, reason: (s.endReason ?? "ABANDONED") as MatchResultState["reason"], detail: s.resultDetail }
      : null,
    rematchVotes: s.rematchVotes,
    rematchCode: s.rematchCode,
    poolRemaining: s.pool.length,
    spectators,
  };
}
