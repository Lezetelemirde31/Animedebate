/**
 * RoomManager — owns every live MatchEngine, matchmaking and lobby listings.
 * All rooms that are not finished live in memory; on boot, rooms that were
 * waiting or in progress are restored from the database.
 */
import { prisma } from "@/lib/db";
import { GAME_RULES } from "@/game/config";
import { shuffle } from "@/game/rules";
import type {
  BidDTO,
  CreateRoomInput,
  LotSummary,
  OpenRoomDTO,
  RoomEvent,
  RoomSettings,
  RoomSnapshot,
} from "@/game/types";
import { ENABLED_ANIME_IDS } from "@/data/anime";
import { CharacterCatalog } from "./catalog";
import { EngineError, MatchEngine, type EngineDeps, type EngineInit } from "./engine";
import { prismaPersistence, type Persistence, type PlayerProfile } from "./persistence";

export interface Transport {
  publishRoom(code: string, snapshot: RoomSnapshot): void;
  emitRoom(code: string, event: RoomEvent & { code: string; at: number }): void;
  emitToUser(userId: string, event: "queue:matched" | "queue:status", payload: unknown): void;
  redirectRoom(from: string, to: string): void;
  roomsChanged(): void;
  statsChanged(): void;
}

const EVICT_AFTER_MS = 10 * 60_000;
const STALE_WAITING_MS = 6 * 60 * 60_000;

export class RoomManager {
  readonly catalog = new CharacterCatalog();
  private engines = new Map<string, MatchEngine>();
  private queue = new Map<string, { since: number }>();
  private transport: Transport | null = null;
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly persistence: Persistence = prismaPersistence) {}

  setTransport(t: Transport): void {
    this.transport = t;
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await this.catalog.load();
    await this.restoreFromDatabase();
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref?.();
  }

  private engineDeps(): EngineDeps {
    return {
      persistence: this.persistence,
      catalog: this.catalog,
      publish: (engine, snapshot) => this.transport?.publishRoom(engine.code, snapshot),
      emit: (engine, event) => this.transport?.emitRoom(engine.code, { ...event, code: engine.code, at: Date.now() }),
      onLifecycle: () => {
        this.transport?.roomsChanged();
        this.transport?.statsChanged();
      },
    };
  }

  private settingsFromRow(m: {
    totalLots: number;
    bidSeconds: number;
    startingBalance: number;
    minIncrement: number;
    animeIds: string[];
  }): RoomSettings {
    return {
      totalLots: m.totalLots,
      bidSeconds: m.bidSeconds,
      startingBalance: m.startingBalance,
      minIncrement: m.minIncrement,
      overtimeSeconds: GAME_RULES.overtimeSeconds,
      animeIds: m.animeIds.filter((id) => ENABLED_ANIME_IDS.includes(id)),
    };
  }

  private async restoreFromDatabase(): Promise<void> {
    const rows = await prisma.match.findMany({
      where: { status: { in: ["WAITING", "IN_PROGRESS"] } },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true, avatarStyle: true, avatarCharacter: { select: { imageUrl: true } } } },
          },
        },
        lots: {
          orderBy: { lotNumber: "asc" },
          include: { bids: { orderBy: { createdAt: "asc" }, include: { user: { select: { username: true } } } } },
        },
      },
    });
    const now = Date.now();
    for (const m of rows) {
      try {
        const settings = this.settingsFromRow(m);
        const stale = m.status === "WAITING" && now - m.createdAt.getTime() > STALE_WAITING_MS;
        if (stale || m.players.length === 0 || settings.animeIds.length === 0) {
          await prisma.match.update({
            where: { id: m.id },
            data: { status: "ABANDONED", endReason: "ABANDONED", endedAt: new Date() },
          });
          continue;
        }
        const soldLots = m.lots.filter((l) => l.status === "SOLD");
        const players: EngineInit["players"] = m.players.map((p) => ({
          userId: p.userId,
          username: p.user.username,
          avatar: { style: p.user.avatarStyle, imageUrl: p.user.avatarCharacter?.imageUrl ?? null },
          seat: p.seat,
          balance: p.balance,
          score: p.score,
          wonCharacterIds: soldLots.filter((l) => l.winnerId === p.userId).map((l) => l.characterId),
        }));
        const init: EngineInit = {
          matchId: m.id,
          code: m.code,
          isPrivate: m.isPrivate,
          isMatchmade: m.isMatchmade,
          hostId: m.hostId,
          settings,
          players,
        };
        if (m.status === "IN_PROGRESS") {
          const active = m.lots.find((l) => l.status === "ACTIVE");
          const used = new Set([...soldLots.map((l) => l.characterId), ...(active ? [active.characterId] : [])]);
          const history: LotSummary[] = m.lots
            .filter((l) => l.status === "SOLD" || l.status === "UNSOLD")
            .flatMap((l) => {
              const character = this.catalog.get(l.characterId);
              return character
                ? [{
                    id: l.id,
                    lotNumber: l.lotNumber,
                    character,
                    status: l.status as "SOLD" | "UNSOLD",
                    winnerId: l.winnerId,
                    finalPrice: l.finalPrice,
                    bidCount: l.bids.length,
                  }]
                : [];
            });
          let currentLot: NonNullable<EngineInit["restore"]>["currentLot"] = null;
          if (active && this.catalog.get(active.characterId)) {
            const bids: BidDTO[] = active.bids.map((b) => ({
              id: b.id,
              userId: b.userId,
              username: b.user.username,
              amount: b.amount,
              at: b.createdAt.getTime(),
            }));
            const top = bids.reduce<BidDTO | null>((best, b) => (!best || b.amount > best.amount ? b : best), null);
            currentLot = {
              id: active.id,
              lotNumber: active.lotNumber,
              characterId: active.characterId,
              startingPrice: active.startingPrice,
              highestBid: top?.amount ?? null,
              highestBidderId: top?.userId ?? null,
              bids,
              startedAt: active.startedAt.getTime(),
              endsAt: null,
              status: "ACTIVE",
              winnerId: null,
              finalPrice: null,
            };
          }
          init.restore = {
            pool: shuffle(this.catalog.idsForAnime(settings.animeIds).filter((id) => !used.has(id))),
            lotsCompleted: history.length,
            history,
            currentLot,
            resumePhase: currentLot ? "BIDDING" : "INTERMISSION",
          };
        }
        this.engines.set(m.code, new MatchEngine(this.engineDeps(), init));
      } catch (err) {
        console.error(`[manager] failed to restore match ${m.code}`, err);
      }
    }
    if (this.engines.size > 0) console.log(`[manager] restored ${this.engines.size} room(s) from the database`);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, engine] of this.engines) {
      if (engine.isEnded && engine.endedAt !== null && now - engine.endedAt > EVICT_AFTER_MS) {
        engine.dispose();
        this.engines.delete(code);
      }
    }
  }

  // ─── Lookups ──────────────────────────────────────────────────────────────

  get(code: string): MatchEngine | undefined {
    return this.engines.get(code);
  }

  /** The non-finished room a user is seated in, if any. */
  activeEngineOf(userId: string): MatchEngine | undefined {
    for (const e of this.engines.values()) if (!e.isEnded && e.hasPlayer(userId)) return e;
    return undefined;
  }

  async findEndedMatch(code: string): Promise<{ matchId: string } | null> {
    const m = await prisma.match.findUnique({ where: { code }, select: { id: true, status: true } });
    return m ? { matchId: m.id } : null;
  }

  async profile(userId: string): Promise<PlayerProfile> {
    const [p] = await this.persistence.getProfiles([userId]);
    if (!p) throw new EngineError("UNAUTHORIZED", "Account not found.");
    return p;
  }

  /**
   * Makes sure a user can take a new seat: a live match elsewhere blocks it,
   * a seat in another lobby is released, and they leave the matchmaking queue.
   */
  async freeUpForSeat(userId: string, exceptCode?: string): Promise<void> {
    const current = this.activeEngineOf(userId);
    if (current && current.code !== exceptCode) {
      if (current.isLive) {
        throw new EngineError("ACTIVE_MATCH", `You are already playing in room ${current.code}.`);
      }
      await current.leave(userId);
    }
    this.leaveQueue(userId);
  }

  // ─── Rooms ────────────────────────────────────────────────────────────────

  private async createEngineRoom(input: {
    hostId: string;
    isPrivate: boolean;
    isMatchmade: boolean;
    settings: RoomSettings;
    playerIds: string[];
  }): Promise<MatchEngine> {
    const profiles = await this.persistence.getProfiles(input.playerIds);
    const { matchId, code } = await this.persistence.createMatch(input);
    const players = input.playerIds.map((id, seat) => {
      const p = profiles.find((x) => x.userId === id)!;
      return { ...p, seat, balance: input.settings.startingBalance };
    });
    const engine = new MatchEngine(this.engineDeps(), {
      matchId,
      code,
      isPrivate: input.isPrivate,
      isMatchmade: input.isMatchmade,
      hostId: input.hostId,
      settings: input.settings,
      players,
    });
    this.engines.set(code, engine);
    this.transport?.roomsChanged();
    this.transport?.statsChanged();
    return engine;
  }

  defaultSettings(overrides?: Partial<RoomSettings>): RoomSettings {
    return {
      totalLots: GAME_RULES.defaultLots,
      bidSeconds: GAME_RULES.defaultTimer,
      startingBalance: GAME_RULES.startingBalance,
      minIncrement: GAME_RULES.minIncrement,
      overtimeSeconds: GAME_RULES.overtimeSeconds,
      animeIds: [...ENABLED_ANIME_IDS],
      ...overrides,
    };
  }

  async createRoom(userId: string, input: CreateRoomInput): Promise<string> {
    await this.freeUpForSeat(userId);
    const settings = this.defaultSettings({
      totalLots: input.totalLots,
      bidSeconds: input.bidSeconds,
      animeIds: input.animeIds,
    });
    if (this.catalog.idsForAnime(settings.animeIds).length < settings.totalLots) {
      throw new EngineError("INVALID_INPUT", "Not enough characters in the selected anime for that many lots.");
    }
    const engine = await this.createEngineRoom({
      hostId: userId,
      isPrivate: input.isPrivate,
      isMatchmade: false,
      settings,
      playerIds: [userId],
    });
    return engine.code;
  }

  async rematch(engine: MatchEngine, userId: string): Promise<void> {
    const allVoted = await engine.voteRematch(userId);
    if (!allVoted || engine.rematchTo) return;
    const snapshot = engine.snapshot();
    const playerIds = snapshot.players.map((p) => p.userId);
    for (const id of playerIds) await this.freeUpForSeat(id);
    const next = await this.createEngineRoom({
      hostId: engine.hostId ?? playerIds[0],
      isPrivate: engine.isPrivate,
      isMatchmade: engine.isMatchmade,
      settings: engine.settings,
      playerIds,
    });
    engine.rematchTo = next.code;
    this.transport?.redirectRoom(engine.code, next.code);
  }

  listOpenRooms(): OpenRoomDTO[] {
    const out: OpenRoomDTO[] = [];
    for (const e of this.engines.values()) {
      if (e.phase !== "LOBBY" || e.isPrivate || e.playerCount() !== 1 || e.connectedPlayerCount() !== 1) continue;
      const host = e.snapshot().players[0];
      out.push({
        code: e.code,
        host: { username: host.username, avatar: host.avatar },
        settings: e.settings,
        createdAt: e.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
  }

  // ─── Matchmaking ──────────────────────────────────────────────────────────

  /** Returns the room code if matched immediately, otherwise null (queued). */
  async joinQueue(userId: string): Promise<string | null> {
    await this.freeUpForSeat(userId);
    // 1) Fill an open public room that is waiting for a challenger.
    const open = [...this.engines.values()]
      .filter((e) => e.phase === "LOBBY" && !e.isPrivate && e.playerCount() === 1 && e.connectedPlayerCount() === 1)
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const room of open) {
      const role = await room.join(await this.profile(userId));
      if (role === "player") {
        this.transport?.statsChanged();
        return room.code;
      }
    }
    // 2) Pair with the longest-waiting player in the queue.
    for (const [otherId] of this.queue) {
      if (otherId === userId) continue;
      this.queue.delete(otherId);
      const engine = await this.createEngineRoom({
        hostId: otherId,
        isPrivate: false,
        isMatchmade: true,
        settings: this.defaultSettings(),
        playerIds: [otherId, userId],
      });
      this.transport?.emitToUser(otherId, "queue:status", { inQueue: false, since: null });
      this.transport?.emitToUser(otherId, "queue:matched", { code: engine.code });
      return engine.code;
    }
    // 3) Wait in the queue.
    const since = Date.now();
    this.queue.set(userId, { since });
    this.transport?.emitToUser(userId, "queue:status", { inQueue: true, since });
    this.transport?.statsChanged();
    return null;
  }

  leaveQueue(userId: string): void {
    if (this.queue.delete(userId)) {
      this.transport?.emitToUser(userId, "queue:status", { inQueue: false, since: null });
      this.transport?.statsChanged();
    }
  }

  queueEntry(userId: string): { since: number } | undefined {
    return this.queue.get(userId);
  }

  stats(): { inQueue: number; liveMatches: number; openRooms: number } {
    let live = 0;
    for (const e of this.engines.values()) if (e.isLive) live++;
    return { inQueue: this.queue.size, liveMatches: live, openRooms: this.listOpenRooms().length };
  }

  shutdown(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const e of this.engines.values()) e.dispose();
  }
}
