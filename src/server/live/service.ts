/**
 * Live game service: the only entry points the HTTP API uses.
 *
 * With PostgreSQL every room operation runs in one transaction holding the
 * room's row lock (`SELECT … FOR UPDATE`), so concurrent requests — even on
 * different serverless instances — are applied one after another.
 * In preview mode (no database) an in-process lock gives the same ordering
 * within a single server instance.
 */
import { prisma, dbMode } from "@/lib/db";
import { GAME_RULES } from "@/game/config";
import type { CreateRoomInput, OpenRoomDTO, PresenceDTO, RoomAction, RoomSettings, RoomSnapshot } from "@/game/types";
import { ENABLED_ANIME_IDS } from "@/data/anime";
import { awardXp, XP_REWARDS } from "@/lib/gamification";
import { getCatalog } from "../catalog";
import {
  DEFAULT_TIMING,
  EngineError,
  advance,
  avatarOf,
  buildSnapshot,
  createRoomTx,
  heartbeat,
  isLivePhase,
  leaveRoom,
  loadRoom,
  placeBid,
  saveRoom,
  seatPlayer,
  setReady,
  skipLot,
  voteRematch,
  type Ctx,
  type EngineHooks,
  type RoomS,
  type Timing,
  type Tx,
} from "./room";

export { EngineError } from "./room";

const TX_OPTIONS = { maxWait: 8_000, timeout: 15_000 } as const;
const QUEUE_LOCK_KEY = 7_314_001;
const QUEUE_STALE_MS = 15_000;
const ONLINE_WINDOW_MS = 45_000;

const state = globalThis as unknown as {
  __aaLiveLocks?: Map<string, Promise<unknown>>;
  __aaLiveSeen?: Map<string, number>;
  __aaLiveHooks?: EngineHooks;
  __aaLiveTiming?: Timing;
};

/** Registers follow-up work (XP, badges) for auction results. */
export function setEngineHooks(hooks: EngineHooks): void {
  state.__aaLiveHooks = hooks;
}

/** Test hook: shorten timers. */
export function setTimingForTests(t: Partial<Timing>): void {
  state.__aaLiveTiming = { ...DEFAULT_TIMING, ...t };
}

/** Default follow-ups: XP (and with it levels and badges) for every character won at auction. */
const DEFAULT_HOOKS: EngineHooks = {
  lotWon: ({ userId, lotId }) => awardXp({ userId, amount: XP_REWARDS.WIN_AUCTION, reason: "WIN_AUCTION", refType: "lot", refId: lotId }),
};

async function makeCtx(tx: Tx): Promise<Ctx> {
  return {
    tx,
    catalog: await getCatalog(),
    timing: state.__aaLiveTiming ?? DEFAULT_TIMING,
    random: Math.random,
    hooks: state.__aaLiveHooks ?? DEFAULT_HOOKS,
  };
}

/** Runs `fn` alone for the given key inside this server instance. */
export function localLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const locks = (state.__aaLiveLocks ??= new Map());
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}

/** Runs `fn` with exclusive access to one room (identified by its code). */
async function exclusive<T>(lockKey: string, fn: (tx: Tx) => Promise<T>, sql?: (tx: Tx) => Promise<unknown>): Promise<T> {
  if ((await dbMode()) === "preview") return localLock(lockKey, () => fn(prisma as unknown as Tx));
  return prisma.$transaction(async (tx) => {
    if (sql) await sql(tx);
    return fn(tx);
  }, TX_OPTIONS);
}

/** Locks the room, runs `fn`, saves and returns the new snapshot (null if the room does not exist). */
async function withRoom<T>(
  code: string,
  fn: (ctx: Ctx, s: RoomS, now: number) => Promise<T>,
): Promise<{ value: T; snapshot: RoomSnapshot } | null> {
  let after: RoomS["after"] = [];
  const out = await exclusive(
    `room:${code}`,
    async (tx) => {
      const match = await tx.match.findUnique({ where: { code } });
      if (!match) return null;
      const ctx = await makeCtx(tx);
      const s = await loadRoom(tx, match.id);
      if (!s) return null;
      const now = Date.now();
      const value = await fn(ctx, s, now);
      await saveRoom(tx, s);
      after = s.after;
      return { value, snapshot: await buildSnapshot(ctx, s, now) };
    },
    (tx) => tx.$queryRaw`SELECT "id" FROM "Match" WHERE "code" = ${code} FOR UPDATE`,
  );
  // Rewards run after the room was committed, so they can never block or roll back the auction.
  for (const job of after) await job().catch((err) => console.error("[live] follow-up failed", err));
  return out;
}

function defaultSettings(overrides?: Partial<RoomSettings>): RoomSettings {
  return {
    totalLots: GAME_RULES.teamSize * GAME_RULES.maxPlayers,
    teamSize: GAME_RULES.teamSize,
    bidSeconds: GAME_RULES.defaultTimer,
    startingBalance: GAME_RULES.startingBalance,
    minIncrement: GAME_RULES.minIncrement,
    overtimeSeconds: GAME_RULES.overtimeSeconds,
    animeIds: [...ENABLED_ANIME_IDS],
    ...overrides,
  };
}

/**
 * Before taking a seat: a started match elsewhere blocks it, a seat in
 * another lobby is released, and the user leaves the matchmaking queue.
 */
async function freeUpForSeat(userId: string, exceptCode?: string): Promise<void> {
  const seats = await prisma.matchPlayer.findMany({
    where: { userId, match: { status: { in: ["WAITING", "IN_PROGRESS"] } } },
    include: { match: true },
  });
  for (const seat of seats) {
    const code = seat.match.code;
    if (code === exceptCode) continue;
    // Bring the other room up to date first: it may have finished or freed the seat by now.
    const res = await withRoom(code, async (ctx, s, now) => {
      await advance(ctx, s, now);
      const stillSeated = s.players.some((p) => p.userId === userId);
      if (stillSeated && isLivePhase(s.phase)) return "live" as const;
      if (stillSeated && s.phase === "LOBBY") await leaveRoom(ctx, s, userId, now);
      return "ok" as const;
    });
    if (res?.value === "live") throw new EngineError("ACTIVE_MATCH", "ACTIVE_MATCH", { code }, { code });
  }
  await prisma.queueEntry.deleteMany({ where: { userId } });
}

// ─── Rooms ──────────────────────────────────────────────────────────────────

export async function createRoom(userId: string, input: CreateRoomInput): Promise<string> {
  await freeUpForSeat(userId);
  const settings = defaultSettings({ bidSeconds: input.bidSeconds, animeIds: input.animeIds });
  const catalog = await getCatalog();
  if (catalog.idsForAnime(settings.animeIds).length < settings.totalLots) {
    throw new EngineError("INVALID_INPUT", "NOT_ENOUGH_CHARACTERS");
  }
  return exclusive("rooms:create", (tx) =>
    createRoomTx(tx, {
      hostId: userId,
      isPrivate: input.isPrivate,
      isMatchmade: false,
      settings,
      playerIds: [userId],
      now: Date.now(),
      seenUserId: userId,
    }),
  );
}

/**
 * Handles every room request: brings the auction up to date, records the
 * caller's heartbeat and applies their action. Returns the new snapshot.
 */
export async function roomRequest(code: string, userId: string, act: RoomAction, receivedAt: number): Promise<RoomSnapshot> {
  if (act.action === "join") {
    const room = await prisma.match.findUnique({ where: { code }, include: { players: true } });
    const seatable =
      room && room.phase === "LOBBY" && room.players.length < GAME_RULES.maxPlayers && !room.players.some((p) => p.userId === userId);
    if (seatable) await freeUpForSeat(userId, code);
  }

  const out = await withRoom(code, async (ctx, s, now) => {
    // 1) Catch up with what happened since the last request (using stored heartbeats).
    //    A bid is judged at the moment it reached the server, not when the lock was free.
    const bidAt = Math.min(receivedAt, now);
    await advance(ctx, s, act.action === "bid" ? bidAt : now);
    const isPlayer = s.players.some((p) => p.userId === userId);
    // 2) Record this caller's presence.
    if (isPlayer) await heartbeat(ctx, s, userId, now);
    else if (act.action === "join" && (await seatPlayer(ctx, s, userId, now))) {
      // seated
    } else await touchSpectator(ctx.tx, s.id, userId, now);
    // 3) The action itself.
    switch (act.action) {
      case "join":
      case "sync":
        // Presence may have changed (e.g. a player came back): resume / start.
        return advance(ctx, s, now);
      case "ready":
        return setReady(ctx, s, userId, act.ready === true, now);
      case "bid":
        if (typeof act.lotId !== "string") throw new EngineError("INVALID_INPUT");
        await placeBid(ctx, s, userId, act.lotId, act.amount, bidAt);
        return advance(ctx, s, now);
      case "skip":
        await skipLot(ctx, s, userId, now);
        return advance(ctx, s, now);
      case "leave":
        return leaveRoom(ctx, s, userId, now);
      case "rematch":
        return voteRematch(ctx, s, userId, now);
      default:
        throw new EngineError("INVALID_INPUT");
    }
  });
  if (!out) throw new EngineError("NOT_FOUND", "ROOM_NOT_FOUND");
  return out.snapshot;
}

async function touchSpectator(tx: Tx, matchId: string, userId: string, now: number): Promise<void> {
  await tx.matchSpectator.upsert({
    where: { matchId_userId: { matchId, userId } },
    create: { matchId, userId, lastSeenAt: new Date(now) },
    update: { lastSeenAt: new Date(now) },
  });
}

export async function listOpenRooms(): Promise<OpenRoomDTO[]> {
  const timing = state.__aaLiveTiming ?? DEFAULT_TIMING;
  const fresh = Date.now() - timing.presenceTimeoutMs;
  const rows = await prisma.match.findMany({
    where: { phase: "LOBBY", isPrivate: false },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { players: { include: { user: { include: { avatarCharacter: { select: { imageUrl: true } } } } } } },
  });
  return rows
    .filter((m) => m.players.length === 1 && m.players[0].lastSeenAt != null && new Date(m.players[0].lastSeenAt).getTime() >= fresh)
    .slice(0, 30)
    .map((m) => ({
      code: m.code,
      host: { username: m.players[0].user.username, avatar: avatarOf(m.players[0].user) },
      settings: {
        totalLots: m.totalLots,
        teamSize: GAME_RULES.teamSize,
        bidSeconds: m.bidSeconds,
        startingBalance: m.startingBalance,
        minIncrement: m.minIncrement,
        overtimeSeconds: GAME_RULES.overtimeSeconds,
        animeIds: m.animeIds,
      },
      createdAt: new Date(m.createdAt).getTime(),
    }));
}

// ─── Matchmaking ────────────────────────────────────────────────────────────

/** Returns the room code if matched right away, otherwise null (queued). */
export async function joinQueue(userId: string): Promise<string | null> {
  await freeUpForSeat(userId);

  // 1) Fill a public room that is waiting for a challenger.
  for (const room of await listOpenRooms()) {
    const res = await withRoom(room.code, async (ctx, s, now) => {
      await advance(ctx, s, now);
      if (s.players.some((p) => p.userId === userId)) return false;
      return seatPlayer(ctx, s, userId, now);
    });
    if (res?.value) return room.code;
  }

  // 2) Pair with the longest-waiting player, or 3) wait in the queue. One decision at a time.
  return exclusive(
    "queue",
    async (tx) => {
      const now = Date.now();
      const waiting = await tx.queueEntry.findMany({ where: { matchedCode: null }, orderBy: { since: "asc" } });
      const other = waiting.find((e) => e.userId !== userId && new Date(e.lastSeenAt).getTime() >= now - QUEUE_STALE_MS);
      if (other) {
        const code = await createRoomTx(tx, {
          hostId: other.userId,
          isPrivate: false,
          isMatchmade: true,
          settings: defaultSettings(),
          playerIds: [other.userId, userId],
          now,
          seenUserId: userId,
        });
        await tx.queueEntry.update({ where: { userId: other.userId }, data: { matchedCode: code } });
        await tx.queueEntry.deleteMany({ where: { userId } });
        return code;
      }
      await tx.queueEntry.upsert({
        where: { userId },
        create: { userId, since: new Date(now), lastSeenAt: new Date(now), matchedCode: null },
        update: { lastSeenAt: new Date(now), matchedCode: null },
      });
      return null;
    },
    (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(${QUEUE_LOCK_KEY})`,
  );
}

export async function leaveQueue(userId: string): Promise<void> {
  await prisma.queueEntry.deleteMany({ where: { userId } });
}

// ─── Presence ───────────────────────────────────────────────────────────────

/** Heartbeat + site stats + the caller's matchmaking status. */
export async function presence(userId: string | null): Promise<PresenceDTO> {
  const now = Date.now();
  let queue: PresenceDTO["queue"] = { inQueue: false, since: null, matchedCode: null };
  let active: PresenceDTO["active"] = null;

  if (userId) {
    // "Online" heartbeat, written at most every 15 seconds per user and instance.
    const seen = (state.__aaLiveSeen ??= new Map());
    if (now - (seen.get(userId) ?? 0) > 15_000) {
      seen.set(userId, now);
      await prisma.user.updateMany({ where: { id: userId }, data: { lastSeenAt: new Date(now) } });
    }
    const entry = await prisma.queueEntry.findUnique({ where: { userId } });
    if (entry?.matchedCode) {
      await prisma.queueEntry.deleteMany({ where: { userId } });
      queue = { inQueue: false, since: null, matchedCode: entry.matchedCode };
    } else if (entry) {
      await prisma.queueEntry.updateMany({ where: { userId }, data: { lastSeenAt: new Date(now) } });
      queue = { inQueue: true, since: new Date(entry.since).getTime(), matchedCode: null };
    }
    const seat = await prisma.matchPlayer.findFirst({
      where: { userId, match: { status: "IN_PROGRESS" } },
      include: { match: true },
    });
    if (seat) active = { code: seat.match.code, phase: seat.match.phase };
  }

  const [online, queued, liveMatches, openRooms] = await Promise.all([
    prisma.user.count({ where: { lastSeenAt: { gte: new Date(now - ONLINE_WINDOW_MS) } } }),
    prisma.queueEntry.findMany({ where: { matchedCode: null } }),
    prisma.match.count({ where: { status: "IN_PROGRESS", updatedAt: { gte: new Date(now - 5 * 60_000) } } }),
    listOpenRooms().then((r) => r.length),
  ]);
  const inQueue = queued.filter((e) => new Date(e.lastSeenAt).getTime() >= now - QUEUE_STALE_MS).length;

  // Opportunistically settle rooms nobody is looking at any more.
  void sweepStaleRooms(2).catch(() => undefined);

  return { serverNow: now, stats: { online, inQueue, liveMatches, openRooms }, active, queue };
}

/** Finishes or abandons rooms whose players all went away (nobody polls them any more). */
async function sweepStaleRooms(limit: number): Promise<void> {
  const stale = await prisma.match.findMany({
    where: { status: { in: ["WAITING", "IN_PROGRESS"] }, updatedAt: { lt: new Date(Date.now() - 90_000) } },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  for (const m of stale) {
    await withRoom(m.code, async (ctx, s, now) => {
      await advance(ctx, s, now);
      // Touch the row so an idle-but-valid lobby is not revisited on every sweep.
      s.dirty = true;
    });
  }
}
