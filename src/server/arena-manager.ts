import { prisma } from "@/lib/db";
import {
  ARENA_MAX_ROUNDS,
  ARENA_WINS_TO_WIN,
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

export { EngineError };

function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, Math.floor(xp)) / 50)) + 1;
}

async function awardArenaXp(userId: string, amount: number, reason: string, refId: string): Promise<void> {
  if (amount <= 0) return;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: amount } },
    select: { xp: true, level: true },
  });
  const nextLevel = levelFromXp(updated.xp);
  if (nextLevel > updated.level) {
    await prisma.user.update({ where: { id: userId }, data: { level: nextLevel } });
    await prisma.notification
      .create({
        data: {
          userId,
          type: "LEVEL_UP",
          title: `Level ${nextLevel} Reached!`,
          message: `You earned enough XP to advance to Level ${nextLevel}.`,
          linkUrl: "/profile",
        },
      })
      .catch(() => undefined);
  }
  await prisma.xpEvent
    .create({
      data: { userId, amount, reason, refType: "ARENA_MATCH", refId },
    })
    .catch(() => undefined);
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

const EVICT_AFTER_MS = 10 * 60_000;
const ROUND_REVEAL_MS = 1_500;
const PRESENCE_WINDOW_MS = 35_000;

export class ArenaManager {
  private rooms = new Map<string, ArenaRoomState>();
  private lastSweepAt = 0;

  constructor(private readonly catalog: CharacterCatalog) {}

  shutdown(): void {
    this.rooms.clear();
  }

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

  private uniqueCode(): string {
    for (let i = 0; i < 40; i++) {
      const code = generateRoomCode();
      if (!this.rooms.has(code)) return code;
    }
    throw new EngineError("SERVER_ERROR", "SERVER_ERROR");
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

  private sweepIfDue(now = Date.now()): void {
    if (now - this.lastSweepAt < 30_000) return;
    this.lastSweepAt = now;
    for (const [code, room] of this.rooms) {
      if ((room.phase === "FINISHED" || room.phase === "ABANDONED") && room.finishedAt && now - room.finishedAt > EVICT_AFTER_MS) {
        this.rooms.delete(code);
      } else if (room.phase === "LOBBY" && now - room.createdAt > 6 * 60 * 60_000) {
        this.rooms.delete(code);
      }
    }
  }

  activeRoomOf(userId: string): ArenaRoomState | undefined {
    for (const room of this.rooms.values()) {
      this.advanceIfNeeded(room);
      if (room.phase === "FINISHED" || room.phase === "ABANDONED") continue;
      if (room.players.some((p) => p.userId === userId)) return room;
    }
    return undefined;
  }

  listOpenRooms(): OpenArenaRoomDTO[] {
    const now = Date.now();
    this.sweepIfDue(now);
    const list: OpenArenaRoomDTO[] = [];
    for (const room of this.rooms.values()) {
      this.advanceIfNeeded(room, now);
      if (room.phase === "LOBBY" && room.players.length === 1) {
        const host = room.players[0];
        list.push({
          code: room.code,
          host: { username: host.username, avatar: host.avatar },
          totalPower: host.totalPower,
          createdAt: room.createdAt,
        });
      }
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

  async createRoom(userId: string, deckIds: string[]): Promise<string> {
    this.sweepIfDue();
    const existing = this.activeRoomOf(userId);
    if (existing) {
      if (existing.phase === "LOBBY" && existing.players.length === 1) {
        this.rooms.delete(existing.code);
      } else {
        throw new EngineError("ACTIVE_MATCH", "ACTIVE_MATCH", { code: existing.code }, { code: existing.code });
      }
    }

    const [profile, deck] = await Promise.all([this.getProfile(userId), this.validatePlayerDeck(userId, deckIds)]);
    const code = this.uniqueCode();
    const now = Date.now();

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

    this.rooms.set(code, room);
    return code;
  }

  async joinRoom(rawCode: string, userId: string, deckIds?: string[]): Promise<ArenaRoomSnapshot> {
    const code = normalizeRoomCode(rawCode);
    if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
    const room = this.rooms.get(code);
    if (!room) throw new EngineError("NOT_FOUND", "ROOM_NOT_FOUND");
    const now = Date.now();
    this.advanceIfNeeded(room, now);

    const existingSeat = room.players.find((p) => p.userId === userId);
    if (existingSeat) {
      existingSeat.lastSeenAt = now;
      existingSeat.connected = true;
      if (room.phase === "LOBBY" && room.players.length === 1 && deckIds && deckIds.length > 0) {
        const deck = await this.validatePlayerDeck(userId, deckIds);
        existingSeat.hand = deck.cards;
        existingSeat.totalPower = deck.totalPower;
      }
      return this.snapshotForUser(room, userId);
    }

    if (room.phase === "LOBBY" && room.players.length < 2) {
      const elsewhere = this.activeRoomOf(userId);
      if (elsewhere && elsewhere.code !== code) {
        if (elsewhere.phase === "LOBBY" && elsewhere.players.length === 1) {
          this.rooms.delete(elsewhere.code);
        } else {
          throw new EngineError("ACTIVE_MATCH", "ACTIVE_MATCH", { code: elsewhere.code }, { code: elsewhere.code });
        }
      }
      const [profile, deck] = await Promise.all([this.getProfile(userId), this.validatePlayerDeck(userId, deckIds)]);
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
      return this.snapshotForUser(room, userId);
    }

    return this.snapshotForUser(room, userId);
  }

  syncRoom(rawCode: string, userId: string): ArenaRoomSnapshot {
    const code = normalizeRoomCode(rawCode);
    if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
    const room = this.rooms.get(code);
    if (!room) throw new EngineError("NOT_FOUND", "ROOM_NOT_FOUND");
    const now = Date.now();
    const player = room.players.find((p) => p.userId === userId);
    if (player) {
      player.lastSeenAt = now;
      player.connected = true;
    }
    this.advanceIfNeeded(room, now);
    return this.snapshotForUser(room, userId);
  }

  async playCard(rawCode: string, userId: string, cardId: string): Promise<ArenaRoomSnapshot> {
    const code = normalizeRoomCode(rawCode);
    if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
    const room = this.rooms.get(code);
    if (!room) throw new EngineError("NOT_FOUND", "ROOM_NOT_FOUND");
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
      await this.finishMatch(room);
      return this.snapshotForUser(room, userId);
    }

    room.phase = "ROUND_REVEAL";
    room.nextAttackerSeat = resolution.winnerSeat !== null ? resolution.winnerSeat : room.attackerSeat === 0 ? 1 : 0;
    room.revealEndsAt = now + ROUND_REVEAL_MS;

    return this.snapshotForUser(room, userId);
  }

  private async finishMatch(room: ArenaRoomState): Promise<void> {
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
      await awardArenaXp(
        p.userId,
        amount,
        winnerId === p.userId ? "ARENA_PVP_WIN" : "ARENA_PVP_PLAY",
        room.code,
      ).catch((err) => console.error("[arena] awardArenaXp failed", err));
    }
  }

  async leaveRoom(rawCode: string, userId: string): Promise<void> {
    const code = normalizeRoomCode(rawCode);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;

    const idx = room.players.findIndex((p) => p.userId === userId);
    if (idx === -1) return;

    if (room.phase === "LOBBY") {
      room.players.splice(idx, 1);
      if (room.players.length === 0) {
        this.rooms.delete(code);
      }
      return;
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
        await awardArenaXp(other.userId, 25, "ARENA_PVP_FORFEIT_WIN", room.code).catch(() => undefined);
      }
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
