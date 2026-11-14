/**
 * MatchEngine — the server-authoritative state machine for one auction room.
 *
 *   LOBBY ──(both ready)──▶ COUNTDOWN ──▶ BIDDING ──(timer)──▶ INTERMISSION ─┐
 *                                            ▲                                │
 *                                            └──────────(next lot)────────────┘
 *   any live phase ──(player disconnects)──▶ PAUSED ──(reconnect)──▶ resumes
 *                                              └──(grace expires)──▶ FINISHED (forfeit) / ABANDONED
 *   last lot / no affordable characters ──▶ FINISHED
 *
 * Every mutation runs inside an AsyncLock and is written to the database
 * before the in-memory state changes and the new snapshot is broadcast, so
 * both players always see the same, persisted state.
 */
import { GAME_RULES } from "@/game/config";
import {
  applyOvertime,
  buildPool,
  canAffordNextBid,
  decideMatchWinner,
  returnToPool,
  scoreForRarity,
  startingPriceFor,
  validateBid,
} from "@/game/rules";
import type {
  BidDTO,
  ErrorCode,
  LotState,
  LotSummary,
  MatchResultState,
  Phase,
  PlayerState,
  RoomEvent,
  RoomSettings,
  RoomSnapshot,
} from "@/game/types";
import type { CharacterCatalog } from "./catalog";
import { AsyncLock } from "./lock";
import type { Persistence, PlayerProfile } from "./persistence";

export class EngineError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface EngineTiming {
  startCountdownMs: number;
  intermissionMs: number;
  reconnectGraceMs: number;
  lobbySeatGraceMs: number;
  minResumeMs: number;
  unopposedCloseMs: number;
}

export interface EngineDeps {
  persistence: Persistence;
  catalog: CharacterCatalog;
  publish: (engine: MatchEngine, snapshot: RoomSnapshot) => void;
  emit: (engine: MatchEngine, event: RoomEvent) => void;
  onLifecycle?: (engine: MatchEngine, change: "players" | "phase" | "ended") => void;
  now?: () => number;
  random?: () => number;
  timing?: Partial<EngineTiming>;
  log?: (message: string, err?: unknown) => void;
}

interface PlayerRuntime extends PlayerProfile {
  seat: number;
  balance: number;
  score: number;
  ready: boolean;
  wonCharacterIds: string[];
  sockets: Set<string>;
  disconnectDeadline: number | null;
  seatTimer: ReturnType<typeof setTimeout> | null;
  /** Whether this player has connected at least once (to tell joins from reconnects). */
  hasConnected: boolean;
}

interface LotRuntime {
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

export interface EngineInit {
  matchId: string;
  code: string;
  isPrivate: boolean;
  isMatchmade: boolean;
  hostId: string | null;
  settings: RoomSettings;
  players: (PlayerProfile & { seat: number; balance: number; score?: number; wonCharacterIds?: string[] })[];
  /** Hydration only. */
  restore?: {
    pool: string[];
    lotsCompleted: number;
    history: LotSummary[];
    currentLot: LotRuntime | null;
    /** Phase to resume into once everyone is back. */
    resumePhase: "BIDDING" | "INTERMISSION";
  };
}

const LIVE_PHASES: Phase[] = ["COUNTDOWN", "BIDDING", "INTERMISSION", "PAUSED"];

export class MatchEngine {
  readonly matchId: string;
  readonly code: string;
  readonly isPrivate: boolean;
  readonly isMatchmade: boolean;
  readonly settings: RoomSettings;
  readonly createdAt: number;

  hostId: string | null;
  phase: Phase = "LOBBY";
  /** Set once a rematch room has been created from this one. */
  rematchTo: string | null = null;
  endedAt: number | null = null;

  private players = new Map<string, PlayerRuntime>();
  private spectatorSockets = new Set<string>();
  private pool: string[] = [];
  private lotsCompleted = 0;
  private currentLot: LotRuntime | null = null;
  private history: LotSummary[] = [];
  private phaseEndsAt: number | null = null;
  private pausedPhase: Phase | null = null;
  private pausedRemainingMs = 0;
  private result: MatchResultState | null = null;
  private rematchVotes = new Set<string>();
  private version = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private readonly lock = new AsyncLock();
  private readonly deps: EngineDeps;
  private readonly timing: EngineTiming;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(deps: EngineDeps, init: EngineInit) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.timing = {
      startCountdownMs: GAME_RULES.startCountdownMs,
      intermissionMs: GAME_RULES.intermissionMs,
      reconnectGraceMs: GAME_RULES.reconnectGraceMs,
      lobbySeatGraceMs: GAME_RULES.lobbySeatGraceMs,
      minResumeMs: GAME_RULES.minResumeMs,
      unopposedCloseMs: GAME_RULES.unopposedCloseMs,
      ...deps.timing,
    };
    this.matchId = init.matchId;
    this.code = init.code;
    this.isPrivate = init.isPrivate;
    this.isMatchmade = init.isMatchmade;
    this.hostId = init.hostId;
    this.settings = init.settings;
    this.createdAt = this.now();
    for (const p of init.players) {
      this.players.set(p.userId, {
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        seat: p.seat,
        balance: p.balance,
        score: p.score ?? 0,
        ready: false,
        wonCharacterIds: p.wonCharacterIds ?? [],
        sockets: new Set(),
        disconnectDeadline: null,
        seatTimer: null,
        hasConnected: false,
      });
    }
    if (init.restore) {
      // A match that was live when the server stopped: resume paused until players return.
      this.pool = init.restore.pool;
      this.lotsCompleted = init.restore.lotsCompleted;
      this.history = init.restore.history;
      this.currentLot = init.restore.currentLot;
      this.phase = "PAUSED";
      this.pausedPhase = init.restore.resumePhase;
      this.pausedRemainingMs = init.restore.resumePhase === "BIDDING" ? this.settings.bidSeconds * 1000 : 2000;
      this.phaseEndsAt = this.now() + this.timing.reconnectGraceMs;
      for (const p of this.players.values()) {
        p.disconnectDeadline = this.phaseEndsAt;
        p.hasConnected = true;
      }
      this.schedule(this.phaseEndsAt);
    } else {
      // Freshly created or reloaded lobby: seats are held briefly until owners connect.
      for (const p of this.players.values()) this.armSeatTimer(p);
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  get isEnded(): boolean {
    return this.phase === "FINISHED" || this.phase === "ABANDONED";
  }

  get isLive(): boolean {
    return LIVE_PHASES.includes(this.phase);
  }

  hasPlayer(userId: string): boolean {
    return this.players.has(userId);
  }

  playerIds(): string[] {
    return [...this.players.keys()];
  }

  playerCount(): number {
    return this.players.size;
  }

  connectedPlayerCount(): number {
    return [...this.players.values()].filter((p) => p.sockets.size > 0).length;
  }

  host(): PlayerRuntime | undefined {
    return this.hostId ? this.players.get(this.hostId) : undefined;
  }

  snapshot(): RoomSnapshot {
    const lot = this.currentLot;
    const players: PlayerState[] = [...this.players.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        seat: p.seat,
        balance: p.balance,
        score: p.score,
        ready: p.ready,
        connected: p.sockets.size > 0,
        isHost: p.userId === this.hostId,
        wonCharacterIds: [...p.wonCharacterIds],
        disconnectDeadline: p.disconnectDeadline,
      }));
    const character = lot ? this.deps.catalog.get(lot.characterId) : undefined;
    return {
      version: this.version,
      serverNow: this.now(),
      matchId: this.matchId,
      code: this.code,
      phase: this.phase,
      isPrivate: this.isPrivate,
      isMatchmade: this.isMatchmade,
      hostId: this.hostId,
      settings: this.settings,
      players,
      lotsCompleted: this.lotsCompleted,
      currentLot:
        lot && character
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
      phaseEndsAt: this.phaseEndsAt,
      pausedPhase: this.pausedPhase,
      history: this.history.slice(),
      result: this.result,
      rematchVotes: [...this.rematchVotes],
      poolRemaining: this.pool.length,
      spectators: this.spectatorSockets.size,
    };
  }

  // ─── Connections ──────────────────────────────────────────────────────────

  attachSocket(userId: string | null, socketId: string): Promise<"player" | "spectator"> {
    return this.lock.run(async () => {
      const p = userId ? this.players.get(userId) : undefined;
      if (!p) {
        this.spectatorSockets.add(socketId);
        this.publish();
        return "spectator";
      }
      const wasDisconnected = p.sockets.size === 0;
      p.sockets.add(socketId);
      if (wasDisconnected) {
        p.disconnectDeadline = null;
        if (p.seatTimer) clearTimeout(p.seatTimer);
        p.seatTimer = null;
        if (p.hasConnected) this.emit({ type: "player_reconnected", userId: p.userId, username: p.username });
        p.hasConnected = true;
        if (this.phase === "PAUSED" && this.allConnected()) this.resume();
      }
      this.publish();
      return "player";
    });
  }

  detachSocket(userId: string | null, socketId: string): Promise<void> {
    return this.lock.run(async () => {
      if (this.spectatorSockets.delete(socketId)) {
        this.publish();
        return;
      }
      const p = userId ? this.players.get(userId) : undefined;
      if (!p || !p.sockets.delete(socketId) || p.sockets.size > 0) return;
      this.handlePlayerGone(p);
      this.publish();
    });
  }

  private handlePlayerGone(p: PlayerRuntime): void {
    this.rematchVotes.delete(p.userId);
    if (this.isEnded) return;
    this.emit({ type: "player_disconnected", userId: p.userId, username: p.username });
    if (this.phase === "LOBBY") {
      p.ready = false;
      this.armSeatTimer(p);
    } else if (this.phase === "PAUSED") {
      p.disconnectDeadline = this.phaseEndsAt;
    } else {
      this.pause(p);
    }
  }

  private armSeatTimer(p: PlayerRuntime): void {
    if (p.seatTimer) clearTimeout(p.seatTimer);
    p.disconnectDeadline = this.now() + this.timing.lobbySeatGraceMs;
    p.seatTimer = setTimeout(() => {
      this.lock
        .run(async () => {
          p.seatTimer = null;
          if (this.phase === "LOBBY" && this.players.get(p.userId) === p && p.sockets.size === 0) {
            await this.removeFromLobby(p.userId);
          }
        })
        .catch((err) => this.log("seat timer failed", err));
    }, this.timing.lobbySeatGraceMs);
  }

  private allConnected(): boolean {
    return [...this.players.values()].every((p) => p.sockets.size > 0);
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────

  /** Seats a user if the lobby has room. Returns their resulting role. */
  join(profile: PlayerProfile): Promise<"player" | "spectator"> {
    return this.lock.run(async () => {
      if (this.players.has(profile.userId)) return "player";
      if (this.phase !== "LOBBY" || this.players.size >= GAME_RULES.maxPlayers) return "spectator";
      const taken = new Set([...this.players.values()].map((p) => p.seat));
      const seat = [0, 1].find((s) => !taken.has(s))!;
      await this.deps.persistence.addPlayer(this.matchId, profile.userId, seat, this.settings.startingBalance);
      this.players.set(profile.userId, {
        ...profile,
        seat,
        balance: this.settings.startingBalance,
        score: 0,
        ready: false,
        wonCharacterIds: [],
        sockets: new Set(),
        disconnectDeadline: null,
        seatTimer: null,
        hasConnected: false,
      });
      // Not connected to this room yet: hold the seat for the grace period.
      this.armSeatTimer(this.players.get(profile.userId)!);
      if (!this.hostId) {
        this.hostId = profile.userId;
        await this.deps.persistence.setHost(this.matchId, profile.userId);
      }
      this.emit({ type: "player_joined", userId: profile.userId, username: profile.username });
      this.publish();
      this.lifecycle("players");
      return "player";
    });
  }

  /** Leaving: frees the seat in the lobby, forfeits a live match. */
  leave(userId: string): Promise<void> {
    return this.lock.run(async () => {
      const p = this.players.get(userId);
      if (!p) return;
      if (this.phase === "LOBBY") {
        await this.removeFromLobby(userId);
      } else if (this.isLive) {
        const other = [...this.players.values()].find((o) => o.userId !== userId);
        await this.finish("FORFEIT", other?.userId ?? null, `${p.username} left the match.`);
      }
    });
  }

  private async removeFromLobby(userId: string): Promise<void> {
    const p = this.players.get(userId);
    if (!p) return;
    await this.deps.persistence.removePlayer(this.matchId, userId);
    if (p.seatTimer) clearTimeout(p.seatTimer);
    this.players.delete(userId);
    this.emit({ type: "player_left", userId, username: p.username });
    if (this.players.size === 0) {
      await this.finish("ABANDONED", null, "Everyone left the room.");
      return;
    }
    if (this.hostId === userId) {
      const next = [...this.players.values()].sort((a, b) => a.seat - b.seat)[0];
      this.hostId = next.userId;
      await this.deps.persistence.setHost(this.matchId, next.userId);
    }
    this.publish();
    this.lifecycle("players");
  }

  setReady(userId: string, ready: boolean): Promise<void> {
    return this.lock.run(async () => {
      const p = this.players.get(userId);
      if (!p) throw new EngineError("NOT_A_PLAYER", "You are not seated in this room.");
      if (this.phase !== "LOBBY") throw new EngineError("INVALID_STATE", "The match has already started.");
      p.ready = ready === true;
      if (this.players.size === GAME_RULES.maxPlayers && this.allConnected() && [...this.players.values()].every((x) => x.ready)) {
        await this.beginMatch();
      }
      this.publish();
    });
  }

  private async beginMatch(): Promise<void> {
    const ids = this.deps.catalog.idsForAnime(this.settings.animeIds);
    if (ids.length === 0) throw new EngineError("INVALID_STATE", "No characters are available for the selected anime.");
    const owners = await this.deps.persistence.getOwnerCounts(this.playerIds());
    await this.deps.persistence.markStarted(this.matchId);
    this.pool = buildPool(ids, (id) => owners.get(id) ?? 0, this.random);
    this.phase = "COUNTDOWN";
    this.phaseEndsAt = this.now() + this.timing.startCountdownMs;
    this.schedule(this.phaseEndsAt);
    this.lifecycle("phase");
  }

  // ─── Bidding ──────────────────────────────────────────────────────────────

  bid(userId: string, lotId: string, amount: unknown): Promise<{ amount: number }> {
    // The bid's timestamp is when the server received it, not when the lock frees up.
    const receivedAt = this.now();
    return this.lock.run(async () => {
      const p = this.players.get(userId);
      const lot = this.currentLot;
      const check = validateBid({
        phase: this.phase,
        now: receivedAt,
        lot: lot && lot.status === "ACTIVE" ? lot : null,
        lotId,
        bidderId: userId,
        isPlayer: !!p,
        balance: p?.balance ?? 0,
        amount,
        minIncrement: this.settings.minIncrement,
      });
      if (!check.ok) throw new EngineError(check.code, check.message);
      const record = await this.deps.persistence.recordBid(lot!.id, userId, check.amount);
      const now = this.now();
      const bid: BidDTO = { id: record.id, userId, username: p!.username, amount: check.amount, at: receivedAt };
      lot!.highestBid = check.amount;
      lot!.highestBidderId = userId;
      lot!.bids.push(bid);
      const ot = applyOvertime(lot!.endsAt!, now, this.settings.overtimeSeconds);
      lot!.endsAt = ot.endsAt;
      const opponents = [...this.players.values()].filter((o) => o.userId !== userId);
      if (opponents.every((o) => !canAffordNextBid(o.balance, lot!, this.settings.minIncrement))) {
        lot!.endsAt = Math.min(lot!.endsAt, now + this.timing.unopposedCloseMs);
      }
      this.schedule(lot!.endsAt);
      this.emit({ type: "bid", bid, overtime: ot.overtime });
      this.publish();
      return { amount: check.amount };
    });
  }

  // ─── Rematch ──────────────────────────────────────────────────────────────

  /** Returns true once every player has voted (caller then creates the new room). */
  voteRematch(userId: string): Promise<boolean> {
    return this.lock.run(async () => {
      if (!this.players.has(userId)) throw new EngineError("NOT_A_PLAYER", "Only players can request a rematch.");
      if (this.phase !== "FINISHED") throw new EngineError("INVALID_STATE", "The match is not finished.");
      if (this.rematchTo) return false;
      if (!this.allConnected()) throw new EngineError("INVALID_STATE", "Your opponent has left the room.");
      this.rematchVotes.add(userId);
      this.publish();
      return this.rematchVotes.size === this.players.size && this.players.size === GAME_RULES.maxPlayers;
    });
  }

  // ─── Timers & phases ──────────────────────────────────────────────────────

  private schedule(at: number): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.disposed) return;
    const delay = Math.max(0, at - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.lock.run(() => this.tick()).catch((err) => this.log("tick failed", err));
    }, delay);
  }

  private async tick(): Promise<void> {
    if (this.disposed) return;
    const now = this.now();
    const due = (at: number | null) => at === null || now + 2 >= at;
    try {
      switch (this.phase) {
        case "COUNTDOWN":
          if (!due(this.phaseEndsAt)) return this.schedule(this.phaseEndsAt!);
          await this.startNextLot();
          break;
        case "BIDDING":
          if (!this.currentLot?.endsAt) return;
          if (!due(this.currentLot.endsAt)) return this.schedule(this.currentLot.endsAt);
          await this.closeLot();
          break;
        case "INTERMISSION":
          if (!due(this.phaseEndsAt)) return this.schedule(this.phaseEndsAt!);
          await this.advance();
          break;
        case "PAUSED":
          if (!due(this.phaseEndsAt)) return this.schedule(this.phaseEndsAt!);
          await this.handlePauseTimeout();
          break;
        default:
          return;
      }
    } catch (err) {
      // Database hiccup: keep the in-memory state untouched and retry shortly.
      this.log(`tick in ${this.phase} failed, retrying`, err);
      this.schedule(this.now() + 2000);
    }
  }

  private async startNextLot(): Promise<void> {
    const players = [...this.players.values()];
    const idx = this.pool.findIndex((id) => {
      const c = this.deps.catalog.get(id);
      return !!c && players.some((p) => p.balance >= startingPriceFor(c.rarity));
    });
    if (idx === -1) {
      const anyMoney = players.some((p) => p.balance > 0);
      await this.finish(
        anyMoney ? "POOL_EXHAUSTED" : "COMPLETED",
        null,
        anyMoney ? "No affordable characters left in the pool." : "Both players spent their entire balance.",
      );
      return;
    }
    const characterId = this.pool[idx];
    const character = this.deps.catalog.get(characterId)!;
    const lotNumber = this.lotsCompleted + 1;
    const startingPrice = startingPriceFor(character.rarity);
    const lotId = await this.deps.persistence.createLot(this.matchId, lotNumber, characterId, startingPrice);
    this.pool.splice(idx, 1);
    const now = this.now();
    this.currentLot = {
      id: lotId,
      lotNumber,
      characterId,
      startingPrice,
      highestBid: null,
      highestBidderId: null,
      bids: [],
      startedAt: now,
      endsAt: now + this.settings.bidSeconds * 1000,
      status: "ACTIVE",
      winnerId: null,
      finalPrice: null,
    };
    this.phase = "BIDDING";
    this.phaseEndsAt = null;
    this.schedule(this.currentLot.endsAt!);
    this.emit({ type: "lot_started", lotNumber, characterName: character.name });
    this.publish();
    this.lifecycle("phase");
  }

  private async closeLot(): Promise<void> {
    const lot = this.currentLot!;
    const character = this.deps.catalog.get(lot.characterId)!;
    if (lot.highestBidderId && lot.highestBid !== null) {
      const winner = this.players.get(lot.highestBidderId)!;
      const price = lot.highestBid;
      const points = scoreForRarity(character.rarity);
      const loserIds = [...new Set(lot.bids.map((b) => b.userId))].filter((id) => id !== winner.userId);
      await this.deps.persistence.settleSold({
        matchId: this.matchId,
        lotId: lot.id,
        characterId: lot.characterId,
        winnerId: winner.userId,
        price,
        points,
        loserIds,
      });
      winner.balance -= price;
      winner.score += points;
      winner.wonCharacterIds.push(lot.characterId);
      lot.status = "SOLD";
      lot.winnerId = winner.userId;
      lot.finalPrice = price;
      this.emit({
        type: "lot_sold",
        lotNumber: lot.lotNumber,
        characterName: character.name,
        winnerId: winner.userId,
        username: winner.username,
        price,
      });
    } else {
      await this.deps.persistence.settleUnsold(lot.id);
      lot.status = "UNSOLD";
      // Nobody bid: the character goes back into the pool.
      this.pool = returnToPool(this.pool, lot.characterId, this.random);
      this.emit({ type: "lot_unsold", lotNumber: lot.lotNumber, characterName: character.name });
    }
    lot.endsAt = null;
    this.history.push({
      id: lot.id,
      lotNumber: lot.lotNumber,
      character,
      status: lot.status as LotSummary["status"],
      winnerId: lot.winnerId,
      finalPrice: lot.finalPrice,
      bidCount: lot.bids.length,
    });
    this.lotsCompleted += 1;
    this.phase = "INTERMISSION";
    this.phaseEndsAt = this.now() + this.timing.intermissionMs;
    this.schedule(this.phaseEndsAt);
    this.publish();
    this.lifecycle("phase");
  }

  private async advance(): Promise<void> {
    if (this.lotsCompleted >= this.settings.totalLots) {
      await this.finish("COMPLETED", null, null);
      return;
    }
    if ([...this.players.values()].every((p) => p.balance <= 0)) {
      await this.finish("COMPLETED", null, "Both players spent their entire balance.");
      return;
    }
    await this.startNextLot();
  }

  private pause(gone: PlayerRuntime): void {
    const now = this.now();
    const resumeAt = this.phase === "BIDDING" ? this.currentLot?.endsAt ?? now : this.phaseEndsAt ?? now;
    this.pausedPhase = this.phase;
    this.pausedRemainingMs = Math.max(0, resumeAt - now);
    if (this.currentLot && this.phase === "BIDDING") this.currentLot.endsAt = null;
    this.phase = "PAUSED";
    this.phaseEndsAt = now + this.timing.reconnectGraceMs;
    gone.disconnectDeadline = this.phaseEndsAt;
    this.schedule(this.phaseEndsAt);
    this.emit({ type: "match_paused", userId: gone.userId });
    this.lifecycle("phase");
  }

  private resume(): void {
    const now = this.now();
    const phase = this.pausedPhase ?? "INTERMISSION";
    this.phase = phase;
    this.pausedPhase = null;
    if (phase === "BIDDING" && this.currentLot) {
      this.currentLot.endsAt = now + Math.max(this.pausedRemainingMs, this.timing.minResumeMs);
      this.phaseEndsAt = null;
      this.schedule(this.currentLot.endsAt);
    } else {
      this.phaseEndsAt = now + Math.max(this.pausedRemainingMs, 1500);
      this.schedule(this.phaseEndsAt);
    }
    for (const p of this.players.values()) p.disconnectDeadline = null;
    this.emit({ type: "match_resumed" });
    this.lifecycle("phase");
  }

  private async handlePauseTimeout(): Promise<void> {
    const present = [...this.players.values()].filter((p) => p.sockets.size > 0);
    if (present.length === 0) {
      await this.finish("ABANDONED", null, "Both players disconnected.");
    } else if (present.length < this.players.size) {
      const gone = [...this.players.values()].filter((p) => p.sockets.size === 0);
      await this.finish("FORFEIT", present[0].userId, `${gone.map((g) => g.username).join(", ")} did not reconnect in time.`);
    } else {
      this.resume();
      this.publish();
    }
  }

  private async finish(reason: MatchResultState["reason"], forcedWinnerId: string | null, detail: string | null): Promise<void> {
    if (this.isEnded) return;
    let winnerId: string | null = forcedWinnerId;
    let explanation = detail ?? "";
    if (reason === "COMPLETED" || reason === "POOL_EXHAUSTED") {
      const decided = decideMatchWinner(
        [...this.players.values()].map((p) => ({ userId: p.userId, score: p.score, balance: p.balance })),
      );
      winnerId = decided.winnerId;
      explanation = detail ? `${detail} ${decided.detail}` : decided.detail;
    }
    const wasStarted = this.phase !== "LOBBY";
    const abandoned = reason === "ABANDONED";
    const results = abandoned
      ? []
      : [...this.players.values()].map((p) => ({
          userId: p.userId,
          result: (winnerId === null ? "DRAW" : p.userId === winnerId ? "WIN" : "LOSS") as "WIN" | "LOSS" | "DRAW",
        }));
    await this.deps.persistence.finishMatch({
      matchId: this.matchId,
      status: abandoned ? "ABANDONED" : "FINISHED",
      winnerId,
      endReason: reason,
      results,
      countStats: !abandoned && wasStarted,
    });
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const p of this.players.values()) {
      if (p.seatTimer) clearTimeout(p.seatTimer);
      p.seatTimer = null;
      p.disconnectDeadline = null;
    }
    if (this.currentLot && this.currentLot.status === "ACTIVE") {
      this.currentLot.status = "CANCELLED";
      this.currentLot.endsAt = null;
    }
    this.phase = abandoned ? "ABANDONED" : "FINISHED";
    this.pausedPhase = null;
    this.phaseEndsAt = null;
    this.endedAt = this.now();
    this.result = { winnerId, reason, detail: explanation };
    this.emit({ type: "match_finished", winnerId });
    this.publish();
    this.lifecycle("ended");
  }

  /** Stops all timers. Called when the manager evicts the engine. */
  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const p of this.players.values()) {
      if (p.seatTimer) clearTimeout(p.seatTimer);
      p.seatTimer = null;
    }
  }

  // ─── Plumbing ─────────────────────────────────────────────────────────────

  private publish(): void {
    this.version += 1;
    this.deps.publish(this, this.snapshot());
  }

  private emit(event: RoomEvent): void {
    this.deps.emit(this, event);
  }

  private lifecycle(change: "players" | "phase" | "ended"): void {
    this.deps.onLifecycle?.(this, change);
  }

  private log(message: string, err?: unknown): void {
    (this.deps.log ?? ((m, e) => console.error(`[match ${this.code}] ${m}`, e ?? "")))(message, err);
  }
}
