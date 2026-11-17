import type { Prisma } from "@prisma/client";
import { prisma, dbMode } from "@/lib/db";
import { awardXp } from "@/lib/gamification";
import {
  ARENA_MAX_ROUNDS,
  ARENA_WINS_TO_WIN,
  ARENA_REVEAL_MS,
  STARTER_CHARACTER_IDS,
  buildAutoDeck,
  isStarterCharacter,
  resolveArenaRound,
  toArenaCard,
  validateDeck,
  type ArenaCard,
  type RoundResolution,
} from "@/game/arena";
import { generateRoomCode, normalizeRoomCode } from "@/game/rules";
import type {
  ArenaPhase,
  ArenaPlayerSnapshot,
  ArenaRoomSnapshot,
  AvatarDTO,
  ErrorCode,
  OpenArenaRoomDTO,
} from "@/game/types";
import { getCatalog, type CharacterCatalog } from "./catalog";
import { EngineError } from "./live/room";
import { localLock } from "./live/service";

export { EngineError };

/**
 * 1v1 Counter-Pick Arena rooms.
 *
 * Rooms are stored in the database (`ArenaRoom`, the whole room as JSON) so
 * that every server instance sees the same room — on serverless hosting each
 * request can land on a different instance. A request locks the room's row
 * (`SELECT … FOR UPDATE`) while it changes it; in preview mode (no database)
 * an in-process lock does the same.
 */

type Tx = Prisma.TransactionClient;

/** Arena XP and Anime Coins go through the shared progression (levels, ranks, badges). */
async function awardArenaXp(userId: string, amount: number, reason: string, refId: string): Promise<void> {
  await awardXp({ userId, amount, reason, refType: "ARENA_MATCH", refId });
}

interface ArenaPlayerSeat {
  userId: string;
  username: string;
  avatar: AvatarDTO;
  seat: 0 | 1;
  hand: ArenaCard[];
  totalPower: number;
  score: number;
  powerDiff: number;
  connected: boolean;
  lastSeenAt: number;
}

interface ArenaRoomState {
  code: string;
  phase: ArenaPhase;
  roundNumber: number;
  attackerSeat: 0 | 1;
  players: ArenaPlayerSeat[];
  attackerCard: ArenaCard | null;
  lastResolution: RoundResolution | null;
  history: RoundResolution[];
  winnerId: string | null;
  xpAwardedByUser: Record<string, number>;
  createdAt: number;
  finishedAt: number | null;
  revealEndsAt: number | null;
  nextAttackerSeat: 0 | 1 | null;
}

/** Work to do after the room was saved (XP), so it can never block or roll back the room. */
type AfterJob = () => Promise<unknown>;

const FINISHED_KEEP_MS = 60 * 60_000;
const LOBBY_KEEP_MS = 6 * 60 * 60_000;
const ROUND_REVEAL_MS = ARENA_REVEAL_MS;
const PRESENCE_WINDOW_MS = 35_000;
const TX_OPTIONS = { maxWait: 8_000, timeout: 15_000 } as const;
const ENDED: ArenaPhase[] = ["FINISHED", "ABANDONED"];

export class ArenaManager {
  private lastSweepAt = 0;

  constructor(private readonly catalog: CharacterCatalog) {}

  shutdown(): void {
    // Rooms live in the database; nothing to release.
  }

  // ─── Storage ──────────────────────────────────────────────────────────────

  /** Runs `fn` with exclusive access to one room. */
  private async exclusive<T>(code: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if ((await dbMode()) === "preview") return localLock(`arena:${code}`, () => fn(prisma as unknown as Tx));
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "code" FROM "ArenaRoom" WHERE "code" = ${code} FOR UPDATE`;
      return fn(tx);
    }, TX_OPTIONS);
  }

  private async load(tx: Tx, code: string): Promise<ArenaRoomState | null> {
    const row = await tx.arenaRoom.findUnique({ where: { code } });
    return row ? (row.state as unknown as ArenaRoomState) : null;
  }

  private async save(tx: Tx, room: ArenaRoomState): Promise<void> {
    const data = {
      phase: room.phase,
      playerIds: room.players.map((p) => p.userId),
      state: room as unknown as Prisma.InputJsonValue,
    };
    await tx.arenaRoom.upsert({ where: { code: room.code }, create: { code: room.code, ...data }, update: data });
  }

  /**
   * Locks a room, lets `fn` change it, saves it (or deletes it when `fn`
   * returns "delete") and runs follow-up jobs after the commit.
   */
  private async withRoom<T>(
    code: string,
    fn: (room: ArenaRoomState, after: AfterJob[]) => Promise<T | { deleted: true; value: T }>,
  ): Promise<T> {
    const after: AfterJob[] = [];
    const value = await this.exclusive(code, async (tx) => {
      const room = await this.load(tx, code);
      if (!room) throw new EngineError("NOT_FOUND", "ROOM_NOT_FOUND");
      const out = await fn(room, after);
      if (out && typeof out === "object" && "deleted" in (out as object) && (out as { deleted: unknown }).deleted === true) {
        await tx.arenaRoom.deleteMany({ where: { code } });
        return (out as { value: T }).value;
      }
      await this.save(tx, room);
      return out as T;
    });
    for (const job of after) await job().catch((err) => console.error("[arena] follow-up failed", err));
    return value;
  }

  /** Removes long-finished and abandoned lobby rooms (at most once a minute per instance). */
  private async sweepIfDue(now = Date.now()): Promise<void> {
    if (now - this.lastSweepAt < 60_000) return;
    this.lastSweepAt = now;
    await prisma.arenaRoom
      .deleteMany({
        where: {
          OR: [
            { phase: { in: ENDED }, updatedAt: { lt: new Date(now - FINISHED_KEEP_MS) } },
            { phase: "LOBBY", updatedAt: { lt: new Date(now - LOBBY_KEEP_MS) } },
          ],
        },
      })
      .catch((err) => console.error("[arena] sweep failed", err));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getArenaCardMap(): Map<string, ArenaCard> {
    const map = new Map<string, ArenaCard>();
    for (const char of this.catalog.all()) {
      map.set(char.id, toArenaCard(char, { isStarter: isStarterCharacter(char.id) }));
    }
    return map;
  }

  private async getUserAllowedIds(userId: string): Promise<Set<string>> {
    const owned = await prisma.ownedCharacter.findMany({
      where: { userId },
      select: { characterId: true },
    });
    const allowed = new Set<string>(STARTER_CHARACTER_IDS);
    for (const row of owned) {
      if (this.catalog.get(row.characterId)) allowed.add(row.characterId);
    }
    return allowed;
  }

  private async getProfile(userId: string): Promise<{ userId: string; username: string; avatar: AvatarDTO }> {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatarStyle: true, avatarCharacter: { select: { imageUrl: true } } },
    });
    if (!u) throw new EngineError("NOT_FOUND", "NOT_FOUND");
    return {
      userId: u.id,
      username: u.username,
      avatar: { style: u.avatarStyle, imageUrl: u.avatarCharacter?.imageUrl ?? null },
    };
  }

  private advanceIfNeeded(room: ArenaRoomState, now = Date.now()): void {
    if (room.phase === "ROUND_REVEAL" && room.revealEndsAt !== null && now >= room.revealEndsAt) {
      room.roundNumber += 1;
      room.attackerSeat = room.nextAttackerSeat ?? 0;
      room.attackerCard = null;
      room.revealEndsAt = null;
      room.nextAttackerSeat = null;
      room.phase = "ATTACK";
    }
    for (const p of room.players) {
      p.connected = now - p.lastSeenAt <= PRESENCE_WINDOW_MS;
    }
  }

  /** The user's unfinished room, if any. */
  async activeRoomOf(userId: string): Promise<ArenaRoomState | undefined> {
    const rows = await prisma.arenaRoom.findMany({
      where: { playerIds: { has: userId }, phase: { notIn: ENDED } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });
    for (const row of rows) {
      const room = row.state as unknown as ArenaRoomState;
      this.advanceIfNeeded(room);
      if (!ENDED.includes(room.phase) && room.players.some((p) => p.userId === userId)) return room;
    }
    return undefined;
  }

  /** Frees the user from another waiting lobby, or refuses if they are mid-match elsewhere. */
  private async leaveOtherRoom(userId: string, exceptCode?: string): Promise<void> {
    const elsewhere = await this.activeRoomOf(userId);
    if (!elsewhere || elsewhere.code === exceptCode) return;
    if (elsewhere.phase === "LOBBY" && elsewhere.players.length === 1) {
      await this.leaveRoom(elsewhere.code, userId);
      return;
    }
    throw new EngineError("ACTIVE_MATCH", "ACTIVE_MATCH", { code: elsewhere.code }, { code: elsewhere.code });
  }

  async listOpenRooms(): Promise<OpenArenaRoomDTO[]> {
    const now = Date.now();
    await this.sweepIfDue(now);
    // A lobby is listed while its host's page keeps checking in.
    const rows = await prisma.arenaRoom.findMany({
      where: { phase: "LOBBY", updatedAt: { gte: new Date(now - PRESENCE_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const list: OpenArenaRoomDTO[] = [];
    for (const row of rows) {
      const room = row.state as unknown as ArenaRoomState;
      if (room.phase !== "LOBBY" || room.players.length !== 1) continue;
      const host = room.players[0];
      if (now - host.lastSeenAt > PRESENCE_WINDOW_MS) continue;
      list.push({
        code: room.code,
        host: { username: host.username, avatar: host.avatar },
        totalPower: host.totalPower,
        createdAt: room.createdAt,
      });
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  snapshotForUser(room: ArenaRoomState, userId: string | null): ArenaRoomSnapshot {
    this.advanceIfNeeded(room);
    const seated = userId ? room.players.find((p) => p.userId === userId) : undefined;
    const players: ArenaPlayerSnapshot[] = room.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
      seat: p.seat,
      score: p.score,
      cardsRemaining: p.hand.length,
      totalPower: p.totalPower,
      connected: p.connected,
    }));

    return {
      code: room.code,
      phase: room.phase,
      roundNumber: room.roundNumber,
      attackerSeat: room.attackerSeat,
      players,
      mySeat: seated ? seated.seat : null,
      myHand: seated ? [...seated.hand] : [],
      attackerCard: room.attackerCard,
      lastResolution: room.lastResolution,
      history: [...room.history],
      winnerId: room.winnerId,
      xpAwarded: userId && room.xpAwardedByUser[userId] !== undefined ? room.xpAwardedByUser[userId] : null,
      createdAt: room.createdAt,
    };
  }

  private async validatePlayerDeck(userId: string, deckIds?: string[]): Promise<{ cards: ArenaCard[]; totalPower: number }> {
    const cardMap = this.getArenaCardMap();
    const allowedIds = await this.getUserAllowedIds(userId);

    if (!deckIds || deckIds.length === 0) {
      const pool = [...allowedIds].map((id) => cardMap.get(id)).filter((c): c is ArenaCard => Boolean(c));
      const auto = buildAutoDeck(pool);
      const totalPower = auto.reduce((s, c) => s + c.powerLevel, 0);
      return { cards: auto, totalPower };
    }

    const res = validateDeck(deckIds, allowedIds, cardMap);
    if (!res.ok) {
      throw new ArenaHttpError("INVALID_INPUT", res.reason);
    }
    return { cards: res.cards, totalPower: res.totalPower };
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  async createRoom(userId: string, deckIds: string[]): Promise<string> {
    await this.sweepIfDue();
    await this.leaveOtherRoom(userId);

    const [profile, deck] = await Promise.all([this.getProfile(userId), this.validatePlayerDeck(userId, deckIds)]);
    const now = Date.now();

    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateRoomCode();
      if (await prisma.arenaRoom.findUnique({ where: { code } })) continue;
      const room: ArenaRoomState = {
        code,
        phase: "LOBBY",
        roundNumber: 1,
        attackerSeat: 0,
        players: [
          {
            userId: profile.userId,
            username: profile.username,
            avatar: profile.avatar,
            seat: 0,
            hand: deck.cards,
            totalPower: deck.totalPower,
            score: 0,
            powerDiff: 0,
            connected: true,
            lastSeenAt: now,
          },
        ],
        attackerCard: null,
        lastResolution: null,
        history: [],
        winnerId: null,
        xpAwardedByUser: {},
        createdAt: now,
        finishedAt: null,
        revealEndsAt: null,
        nextAttackerSeat: null,
      };
      try {
        await prisma.arenaRoom.create({
          data: { code, phase: room.phase, playerIds: [userId], state: room as unknown as Prisma.InputJsonValue },
        });
        return code;
      } catch {
        // Code taken by a concurrent request: try another one.
      }
    }
    throw new EngineError("SERVER_ERROR", "SERVER_ERROR");
  }

  async joinRoom(rawCode: string, userId: string, deckIds?: string[]): Promise<ArenaRoomSnapshot> {
    const code = normalizeRoomCode(rawCode);
    if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");

    // Taking a free seat: leave any other waiting lobby first (outside this room's lock).
    const peek = await prisma.arenaRoom.findUnique({ where: { code } });
    if (!peek) throw new EngineError("NOT_FOUND", "ROOM_NOT_FOUND");
    const seatFree = peek.phase === "LOBBY" && !peek.playerIds.includes(userId) && peek.playerIds.length < 2;
    const seatData = seatFree
      ? await Promise.all([this.leaveOtherRoom(userId, code), this.getProfile(userId), this.validatePlayerDeck(userId, deckIds)])
      : null;
    const ownDeck =
      !seatFree && peek.phase === "LOBBY" && peek.playerIds.length === 1 && peek.playerIds[0] === userId && deckIds && deckIds.length > 0
        ? await this.validatePlayerDeck(userId, deckIds)
        : null;

    return this.withRoom(code, async (room) => {
      const now = Date.now();
      this.advanceIfNeeded(room, now);

      const existingSeat = room.players.find((p) => p.userId === userId);
      if (existingSeat) {
        existingSeat.lastSeenAt = now;
        existingSeat.connected = true;
        if (room.phase === "LOBBY" && room.players.length === 1 && ownDeck) {
          existingSeat.hand = ownDeck.cards;
          existingSeat.totalPower = ownDeck.totalPower;
        }
        return this.snapshotForUser(room, userId);
      }

      if (room.phase === "LOBBY" && room.players.length < 2 && seatData) {
        const [, profile, deck] = seatData;
        room.players.push({
          userId: profile.userId,
          username: profile.username,
          avatar: profile.avatar,
          seat: 1,
          hand: deck.cards,
          totalPower: deck.totalPower,
          score: 0,
          powerDiff: 0,
          connected: true,
          lastSeenAt: now,
        });
        room.phase = "ATTACK";
        room.roundNumber = 1;
        room.attackerSeat = Math.random() < 0.5 ? 0 : 1;
      }
      return this.snapshotForUser(room, userId);
    });
  }

  async syncRoom(rawCode: string, userId: string): Promise<ArenaRoomSnapshot> {
    const code = normalizeRoomCode(rawCode);
    if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
    return this.withRoom(code, async (room) => {
      const now = Date.now();
      const player = room.players.find((p) => p.userId === userId);
      if (player) {
        player.lastSeenAt = now;
        player.connected = true;
      }
      this.advanceIfNeeded(room, now);
      return this.snapshotForUser(room, userId);
    });
  }

  async playCard(rawCode: string, userId: string, cardId: string): Promise<ArenaRoomSnapshot> {
    const code = normalizeRoomCode(rawCode);
    if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
    return this.withRoom(code, async (room, after) => {
      const now = Date.now();
      this.advanceIfNeeded(room, now);

      const player = room.players.find((p) => p.userId === userId);
      if (!player) throw new EngineError("NOT_A_PLAYER");
      player.lastSeenAt = now;
      player.connected = true;

      if (room.phase !== "ATTACK" && room.phase !== "DEFEND") {
        throw new EngineError("INVALID_STATE");
      }

      const expectedSeat: 0 | 1 = room.phase === "ATTACK" ? room.attackerSeat : room.attackerSeat === 0 ? 1 : 0;
      if (player.seat !== expectedSeat) {
        throw new EngineError("INVALID_STATE");
      }

      const cardIdx = player.hand.findIndex((c) => c.id === cardId);
      if (cardIdx === -1) {
        throw new EngineError("INVALID_INPUT");
      }

      const [chosen] = player.hand.splice(cardIdx, 1);

      if (room.phase === "ATTACK") {
        room.attackerCard = chosen;
        room.phase = "DEFEND";
        return this.snapshotForUser(room, userId);
      }

      const attackerCard = room.attackerCard;
      if (!attackerCard) {
        throw new EngineError("SERVER_ERROR");
      }

      const resolution = resolveArenaRound(room.roundNumber, room.attackerSeat, attackerCard, chosen);
      room.lastResolution = resolution;
      room.history.push(resolution);

      const attackerPlayer = room.players[resolution.attackerSeat];
      const defenderPlayer = room.players[resolution.defenderSeat];
      attackerPlayer.powerDiff += resolution.attackerTotal - resolution.defenderTotal;
      defenderPlayer.powerDiff += resolution.defenderTotal - resolution.attackerTotal;

      if (resolution.winnerSeat !== null) {
        room.players[resolution.winnerSeat].score += 1;
      }

      const p0 = room.players[0];
      const p1 = room.players[1];
      const matchComplete =
        p0.score >= ARENA_WINS_TO_WIN ||
        p1.score >= ARENA_WINS_TO_WIN ||
        room.roundNumber >= ARENA_MAX_ROUNDS ||
        (p0.hand.length === 0 && p1.hand.length === 0);

      if (matchComplete) {
        this.finishMatch(room, after);
        return this.snapshotForUser(room, userId);
      }

      room.phase = "ROUND_REVEAL";
      room.nextAttackerSeat = resolution.winnerSeat !== null ? resolution.winnerSeat : room.attackerSeat === 0 ? 1 : 0;
      room.revealEndsAt = now + ROUND_REVEAL_MS;

      return this.snapshotForUser(room, userId);
    });
  }

  private finishMatch(room: ArenaRoomState, after: AfterJob[]): void {
    const [p0, p1] = room.players;
    let winnerId: string | null = null;
    if (p0 && p1) {
      if (p0.score !== p1.score) {
        winnerId = p0.score > p1.score ? p0.userId : p1.userId;
      } else if (p0.powerDiff !== p1.powerDiff) {
        winnerId = p0.powerDiff > p1.powerDiff ? p0.userId : p1.userId;
      }
    }

    room.phase = "FINISHED";
    room.attackerCard = null;
    room.revealEndsAt = null;
    room.nextAttackerSeat = null;
    room.winnerId = winnerId;
    room.finishedAt = Date.now();

    for (const p of room.players) {
      const amount = winnerId && p.userId === winnerId ? 35 : 15;
      room.xpAwardedByUser[p.userId] = amount;
      after.push(() => awardArenaXp(p.userId, amount, winnerId === p.userId ? "ARENA_PVP_WIN" : "ARENA_PVP_PLAY", room.code));
    }
  }

  async leaveRoom(rawCode: string, userId: string): Promise<void> {
    const code = normalizeRoomCode(rawCode);
    if (!code) return;
    try {
      await this.withRoom(code, async (room, after) => {
        const idx = room.players.findIndex((p) => p.userId === userId);
        if (idx === -1) return undefined;

        if (room.phase === "LOBBY") {
          room.players.splice(idx, 1);
          if (room.players.length === 0) return { deleted: true as const, value: undefined };
          return undefined;
        }

        if (room.phase === "ATTACK" || room.phase === "DEFEND" || room.phase === "ROUND_REVEAL") {
          const other = room.players.find((p) => p.userId !== userId) ?? null;
          room.phase = "FINISHED";
          room.attackerCard = null;
          room.revealEndsAt = null;
          room.nextAttackerSeat = null;
          room.winnerId = other?.userId ?? null;
          room.finishedAt = Date.now();
          if (other) {
            room.xpAwardedByUser[other.userId] = 25;
            after.push(() => awardArenaXp(other.userId, 25, "ARENA_PVP_FORFEIT_WIN", room.code));
          }
        }
        return undefined;
      });
    } catch (err) {
      if (err instanceof EngineError && err.code === "NOT_FOUND") return;
      throw err;
    }
  }
}

export class ArenaHttpError extends Error {
  constructor(
    public code: ErrorCode,
    public reason: "WRONG_SIZE" | "DUPLICATE_CARDS" | "UNOWNED_CARD" | "OVER_BUDGET",
  ) {
    super(reason);
  }
}

const g = globalThis as unknown as { __aaArenaManager?: ArenaManager };

export async function getArenaManager(): Promise<ArenaManager> {
  if (!g.__aaArenaManager) {
    g.__aaArenaManager = new ArenaManager(await getCatalog());
  }
  return g.__aaArenaManager;
}
