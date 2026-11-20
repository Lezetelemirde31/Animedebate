/**
 * Anime 1v1 — server side.
 *
 * Matches are stored in the database (VersusMatch, the whole match as JSON)
 * and every request locks the row (`SELECT … FOR UPDATE`), so any server
 * instance can serve any request. Timers are checked on every request.
 * Hidden information — the opponent's pick during the draft and their move
 * for the current turn — never leaves the server until it is revealed.
 */
import type { Prisma } from "@prisma/client";
import { prisma, dbMode } from "@/lib/db";
import { buildKit, type FighterKit } from "@/game/versus/kit";
import {
  battleResult,
  chooseBotMove,
  moveError,
  newFighter,
  resolveTurn,
  seededRandom,
  type BotLevel,
  type FighterState,
  type Move,
  type TurnLog,
} from "@/game/versus/engine";
import { generateRoomCode, normalizeRoomCode } from "@/game/rules";
import type { AvatarDTO } from "@/game/types";
import { getCatalog } from "../catalog";
import { EngineError, avatarOf } from "../live/room";
import { localLock } from "../live/service";
import { currentSeason, recordGameResult } from "../platform/results";

type Tx = Prisma.TransactionClient;

export type VersusMode = "ranked" | "friendly" | "bot";
export type VersusPhase = "LOBBY" | "PICK" | "BATTLE" | "FINISHED" | "ABANDONED";
export type EndReason = "ko" | "turns" | "double_ko" | "forfeit" | "timeout";

export const PICK_MS = 45_000;
export const TURN_MS = 25_000;
/** Extra time after a turn so both players can watch it play out. */
export const REVEAL_MS = 3_000;
/** Turns in a row without choosing a move before the match is lost. */
export const MAX_TIMEOUTS = 3;
const LOBBY_TTL_MS = 30 * 60_000;
const QUEUE_STALE_MS = 15_000;
const TX_OPTIONS = { maxWait: 8_000, timeout: 15_000 } as const;
const BOT_DAILY_REWARDS = 15;

interface Seat {
  userId: string | null; // null = bot
  username: string;
  avatar: AvatarDTO;
  rating: number | null;
  lastSeenAt: number;
  pick: string | null;
  fighter: FighterState | null;
  move: Move | null;
  /** Turns in a row that ran out of time. */
  timeouts: number;
}

interface VersusState {
  code: string;
  mode: VersusMode;
  botLevel: BotLevel | null;
  phase: VersusPhase;
  createdAt: number;
  phaseEndsAt: number | null;
  turn: number;
  seats: Seat[];
  log: TurnLog[];
  result: { winner: 0 | 1 | null; reason: EndReason } | null;
  seed: number;
  rematchVotes: string[];
  rematchCode: string | null;
  recorded: boolean;
  /** The player who left the match (forfeit). */
  forfeitedBy?: string | null;
}

// ─── Snapshot (what a player may see) ──────────────────────────────────────

export interface VersusSeatView {
  userId: string | null;
  username: string;
  avatar: AvatarDTO;
  rating: number | null;
  isBot: boolean;
  connected: boolean;
  /** Draft: whether this seat has locked in a pick (the pick itself is hidden until both are in). */
  picked: boolean;
  pick: string | null;
  fighter: FighterState | null;
  /** Battle: whether this seat has chosen this turn's move (the move itself stays hidden). */
  moveReady: boolean;
  timeouts: number;
}

export interface VersusSnapshot {
  code: string;
  createdAt: number;
  mode: VersusMode;
  botLevel: BotLevel | null;
  phase: VersusPhase;
  serverNow: number;
  phaseEndsAt: number | null;
  turn: number;
  mySeat: 0 | 1 | null;
  myMove: Move | null;
  seats: VersusSeatView[];
  log: TurnLog[];
  result: VersusState["result"];
  rematchVotes: string[];
  rematchCode: string | null;
  /** Rating change for each seat once the match is recorded (ranked only). */
  ratingChange: (number | null)[] | null;
}

function snapshot(s: VersusState, viewerId: string | null, now: number, ratingChange: (number | null)[] | null = null): VersusSnapshot {
  const mySeat = s.seats.findIndex((x) => x.userId !== null && x.userId === viewerId);
  const reveal = s.phase !== "PICK" || s.seats.every((x) => x.pick);
  return {
    code: s.code,
    createdAt: s.createdAt,
    mode: s.mode,
    botLevel: s.botLevel,
    phase: s.phase,
    serverNow: now,
    phaseEndsAt: s.phaseEndsAt,
    turn: s.turn,
    mySeat: mySeat === -1 ? null : (mySeat as 0 | 1),
    myMove: mySeat === -1 ? null : s.seats[mySeat].move,
    seats: s.seats.map((x, i) => ({
      userId: x.userId,
      username: x.username,
      avatar: x.avatar,
      rating: x.rating,
      isBot: x.userId === null,
      connected: x.userId === null || now - x.lastSeenAt < 15_000,
      picked: !!x.pick,
      pick: reveal || i === mySeat ? x.pick : null,
      fighter: x.fighter,
      moveReady: !!x.move,
      timeouts: x.timeouts,
    })),
    log: s.log,
    result: s.result,
    rematchVotes: s.rematchVotes,
    rematchCode: s.rematchCode,
    ratingChange,
  };
}

// ─── Roster ────────────────────────────────────────────────────────────────

export interface RosterEntry extends FighterKit {
  rarity: string;
  powerLevel: number | null;
}

const rosterCache = globalThis as unknown as { __aaVersusRoster?: { at: number; list: RosterEntry[]; byId: Map<string, RosterEntry> } };

/** Every playable character with its 1v1 kit (cached per server instance). */
export async function getRoster(): Promise<{ list: RosterEntry[]; byId: Map<string, RosterEntry> }> {
  const hit = rosterCache.__aaVersusRoster;
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit;
  const catalog = await getCatalog();
  const list = catalog
    .all()
    .map((c) => ({ ...buildKit(c), rarity: c.rarity, powerLevel: c.powerLevel }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const entry = { at: Date.now(), list, byId: new Map(list.map((r) => [r.characterId, r])) };
  rosterCache.__aaVersusRoster = entry;
  return entry;
}

// ─── Storage ───────────────────────────────────────────────────────────────

async function exclusive<T>(key: string, fn: (tx: Tx) => Promise<T>, lockSql: (tx: Tx) => Promise<unknown>): Promise<T> {
  if ((await dbMode()) === "preview") return localLock(key, () => fn(prisma as unknown as Tx));
  return prisma.$transaction(async (tx) => {
    await lockSql(tx);
    return fn(tx);
  }, TX_OPTIONS);
}

async function save(tx: Tx, s: VersusState): Promise<void> {
  const data = {
    mode: s.mode,
    phase: s.phase,
    playerIds: s.seats.map((x) => x.userId).filter((x): x is string => !!x),
    state: s as unknown as Prisma.InputJsonValue,
  };
  await tx.versusMatch.upsert({ where: { code: s.code }, create: { code: s.code, ...data }, update: data });
}

/**
 * Locks a match, catches it up with the clock, runs `fn`, catches up again,
 * saves and returns the final state; results are recorded after the commit.
 */
async function withMatch(code: string, fn: (s: VersusState, now: number) => Promise<void> | void): Promise<VersusState> {
  let toRecord: VersusState | null = null;
  const out = await exclusive(
    `versus:${code}`,
    async (tx) => {
      const row = await tx.versusMatch.findUnique({ where: { code } });
      if (!row) throw new EngineError("NOT_FOUND", "VERSUS_NOT_FOUND");
      const s = row.state as unknown as VersusState;
      const now = Date.now();
      await advance(s, now);
      await fn(s, now);
      await advance(s, Date.now());
      if (s.result && !s.recorded) {
        s.recorded = true;
        toRecord = structuredClone(s);
      }
      await save(tx, s);
      return s;
    },
    (tx) => tx.$queryRaw`SELECT "code" FROM "VersusMatch" WHERE "code" = ${code} FOR UPDATE`,
  );
  if (toRecord) await recordResult(toRecord).catch((err) => console.error("[versus] record failed", err));
  return out;
}

async function profile(userId: string): Promise<{ username: string; avatar: AvatarDTO }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, avatarStyle: true, avatarCustomUrl: true, avatarCharacter: { select: { imageUrl: true } } },
  });
  if (!u) throw new EngineError("NOT_FOUND", "NOT_FOUND");
  return { username: u.username, avatar: avatarOf(u) };
}

async function seasonRating(userId: string): Promise<number> {
  const season = await currentSeason();
  const r = await prisma.gameRating.findUnique({ where: { userId_game_seasonId: { userId, game: "VERSUS", seasonId: season.id } } });
  return r?.rating ?? 1000;
}

function seat(userId: string | null, username: string, avatar: AvatarDTO, rating: number | null, now: number): Seat {
  return { userId, username, avatar, rating, lastSeenAt: now, pick: null, fighter: null, move: null, timeouts: 0 };
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = generateRoomCode();
    if (!(await prisma.versusMatch.findUnique({ where: { code } }))) return code;
  }
  throw new EngineError("SERVER_ERROR");
}

/** An unfinished match this user is seated in, if any. */
export async function activeMatchOf(userId: string): Promise<string | null> {
  const rows = await prisma.versusMatch.findMany({
    where: { playerIds: { has: userId }, phase: { in: ["LOBBY", "PICK", "BATTLE"] } },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  for (const row of rows) {
    const s = row.state as unknown as VersusState;
    await advance(s, Date.now());
    if (s.phase === "LOBBY" || s.phase === "PICK" || s.phase === "BATTLE") return s.code;
  }
  return null;
}

async function ensureFree(userId: string): Promise<void> {
  const busy = await activeMatchOf(userId);
  if (busy) throw new EngineError("ACTIVE_MATCH", "VERSUS_ACTIVE", { code: busy }, { code: busy });
}

// ─── Game flow ─────────────────────────────────────────────────────────────

function startBattle(s: VersusState, roster: Map<string, RosterEntry>, now: number): void {
  for (const x of s.seats) {
    const kit = roster.get(x.pick!);
    if (!kit) throw new EngineError("INVALID_STATE");
    const { rarity: _r, powerLevel: _p, ...fighterKit } = kit;
    void _r;
    void _p;
    x.fighter = newFighter(fighterKit);
    x.move = null;
    x.timeouts = 0;
  }
  s.phase = "BATTLE";
  s.turn = 1;
  s.phaseEndsAt = now + TURN_MS;
  prepareTurn(s);
}

/** Stunned fighters can't act: their (ignored) move is filled in so nobody waits for them. */
function prepareTurn(s: VersusState): void {
  for (const x of s.seats) if (x.fighter?.stunned) x.move = { type: "DEFEND" };
}

function botMove(s: VersusState): void {
  const i = s.seats.findIndex((x) => x.userId === null);
  if (i === -1 || s.seats[i].move) return;
  const fighters = [s.seats[0].fighter!, s.seats[1].fighter!] as [FighterState, FighterState];
  const rand = seededRandom(s.seed + s.turn * 7919);
  s.seats[i].move = chooseBotMove(fighters, i as 0 | 1, s.botLevel ?? "NORMAL", s.turn, rand);
}

function finish(s: VersusState, winner: 0 | 1 | null, reason: EndReason, now: number): void {
  s.result = { winner, reason };
  s.phase = "FINISHED";
  s.phaseEndsAt = null;
  void now;
}

function playTurn(s: VersusState, now: number): void {
  const timedOut: [boolean, boolean] = [false, false];
  for (const [i, x] of s.seats.entries()) {
    if (!x.move) {
      x.move = { type: "DEFEND" };
      timedOut[i] = true;
      x.timeouts += 1;
    } else if (!x.fighter?.stunned) {
      x.timeouts = 0;
    }
  }
  const fighters = [s.seats[0].fighter!, s.seats[1].fighter!] as [FighterState, FighterState];
  const moves = [s.seats[0].move!, s.seats[1].move!] as [Move, Move];
  const out = resolveTurn(fighters, moves, s.turn, timedOut);
  s.seats[0].fighter = out.fighters[0];
  s.seats[1].fighter = out.fighters[1];
  s.log.push(out.log);
  for (const x of s.seats) x.move = null;

  const res = battleResult(out.fighters, s.turn);
  if (res) return finish(s, res.winner, res.reason, now);
  // Walking away: too many turns in a row without a move.
  const gone = s.seats.map((x) => x.userId !== null && x.timeouts >= MAX_TIMEOUTS);
  if (gone[0] || gone[1]) {
    const winner = gone[0] && gone[1] ? null : gone[0] ? 1 : 0;
    return finish(s, winner, "timeout", now);
  }
  s.turn += 1;
  s.phaseEndsAt = now + TURN_MS + REVEAL_MS;
  prepareTurn(s);
}

/** Catches the match up with the clock (draft timeout, turn timeouts, idle lobbies). */
async function advance(s: VersusState, now: number): Promise<void> {
  for (let guard = 0; guard < 25; guard++) {
    if (s.phase === "LOBBY") {
      if (now - s.createdAt > LOBBY_TTL_MS) {
        s.phase = "ABANDONED";
        s.phaseEndsAt = null;
      }
      return;
    }
    if (s.phase === "PICK") {
      if (s.seats.every((x) => x.pick)) {
        startBattle(s, (await getRoster()).byId, now);
        continue;
      }
      if (s.phaseEndsAt !== null && now >= s.phaseEndsAt) {
        // Time is up: anyone who didn't pick gets a random character.
        const roster = (await getRoster()).list;
        const rand = seededRandom(s.seed + 17);
        for (const x of s.seats) if (!x.pick) x.pick = roster[Math.floor(rand() * roster.length)].characterId;
        continue;
      }
      return;
    }
    if (s.phase === "BATTLE") {
      if (s.mode === "bot") botMove(s);
      if (s.seats.every((x) => x.move)) {
        playTurn(s, now);
        continue;
      }
      if (s.phaseEndsAt !== null && now >= s.phaseEndsAt) {
        playTurn(s, s.phaseEndsAt);
        continue;
      }
      return;
    }
    return;
  }
}

// ─── Public actions ────────────────────────────────────────────────────────

export async function createBotMatch(userId: string, level: BotLevel): Promise<string> {
  await ensureFree(userId);
  const me = await profile(userId);
  const roster = (await getRoster()).list;
  const now = Date.now();
  const seed = Math.floor(Math.random() * 2 ** 31);
  const bot = seat(null, level === "EASY" ? "Çaylak Bot" : level === "HARD" ? "Usta Bot" : "Taktik Bot", { style: "violet", imageUrl: null }, null, now);
  bot.pick = roster[Math.floor(seededRandom(seed)() * roster.length)].characterId;
  const s: VersusState = {
    code: await uniqueCode(),
    mode: "bot",
    botLevel: level,
    phase: "PICK",
    createdAt: now,
    phaseEndsAt: now + PICK_MS,
    turn: 0,
    seats: [seat(userId, me.username, me.avatar, null, now), bot],
    log: [],
    result: null,
    seed,
    rematchVotes: [],
    rematchCode: null,
    recorded: false,
  };
  await prisma.versusMatch.create({ data: { code: s.code, mode: s.mode, phase: s.phase, playerIds: [userId], state: s as unknown as Prisma.InputJsonValue } });
  return s.code;
}

export async function createFriendlyMatch(userId: string): Promise<string> {
  await ensureFree(userId);
  const me = await profile(userId);
  const now = Date.now();
  const s: VersusState = {
    code: await uniqueCode(),
    mode: "friendly",
    botLevel: null,
    phase: "LOBBY",
    createdAt: now,
    phaseEndsAt: null,
    turn: 0,
    seats: [seat(userId, me.username, me.avatar, null, now)],
    log: [],
    result: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    rematchVotes: [],
    rematchCode: null,
    recorded: false,
  };
  await prisma.versusMatch.create({ data: { code: s.code, mode: s.mode, phase: s.phase, playerIds: [userId], state: s as unknown as Prisma.InputJsonValue } });
  return s.code;
}

async function createRankedMatch(tx: Tx, a: string, b: string, now: number): Promise<string> {
  const [pa, pb, ra, rb] = await Promise.all([profile(a), profile(b), seasonRating(a), seasonRating(b)]);
  let code = generateRoomCode();
  for (let i = 0; i < 12 && (await tx.versusMatch.findUnique({ where: { code } })); i++) code = generateRoomCode();
  const s: VersusState = {
    code,
    mode: "ranked",
    botLevel: null,
    phase: "PICK",
    createdAt: now,
    phaseEndsAt: now + PICK_MS,
    turn: 0,
    seats: [seat(a, pa.username, pa.avatar, ra, now), seat(b, pb.username, pb.avatar, rb, now)],
    log: [],
    result: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    rematchVotes: [],
    rematchCode: null,
    recorded: false,
  };
  await save(tx, s);
  return code;
}

export type VersusAction =
  | { action: "sync" }
  | { action: "join" }
  | { action: "pick"; characterId: string }
  | { action: "move"; move: Move; turn: number }
  | { action: "leave" }
  | { action: "rematch" };

export async function matchRequest(rawCode: string, userId: string, act: VersusAction): Promise<VersusSnapshot> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
  if (act.action === "join") {
    const row = await prisma.versusMatch.findUnique({ where: { code } });
    if (row && row.phase === "LOBBY" && !row.playerIds.includes(userId)) await ensureFree(userId);
  }
  const joinProfile = act.action === "join" ? await profile(userId) : null;
  const roster = act.action === "pick" ? (await getRoster()).byId : null;

  const final = await withMatch(code, async (s, now) => {
    const i = s.seats.findIndex((x) => x.userId === userId);
    if (i !== -1) s.seats[i].lastSeenAt = now;
    switch (act.action) {
      case "sync":
        break;
      case "join":
        if (i === -1 && s.phase === "LOBBY" && s.seats.length === 1 && joinProfile) {
          s.seats.push(seat(userId, joinProfile.username, joinProfile.avatar, null, now));
          s.phase = "PICK";
          s.phaseEndsAt = now + PICK_MS;
        }
        break;
      case "pick": {
        if (i === -1) throw new EngineError("NOT_A_PLAYER");
        if (s.phase !== "PICK") throw new EngineError("INVALID_STATE", "VERSUS_NOT_PICKING");
        if (s.seats[i].pick) throw new EngineError("INVALID_STATE", "VERSUS_ALREADY_PICKED");
        if (typeof act.characterId !== "string" || !roster?.has(act.characterId)) throw new EngineError("INVALID_INPUT", "VERSUS_BAD_PICK");
        s.seats[i].pick = act.characterId;
        break;
      }
      case "move": {
        if (i === -1) throw new EngineError("NOT_A_PLAYER");
        if (s.phase !== "BATTLE") throw new EngineError("INVALID_STATE", "VERSUS_NOT_BATTLE");
        if (act.turn !== s.turn) throw new EngineError("INVALID_STATE", "VERSUS_TURN_OVER");
        const me = s.seats[i];
        if (me.move) throw new EngineError("INVALID_STATE", "VERSUS_ALREADY_MOVED");
        const err = moveError(me.fighter!, act.move);
        if (err) throw new EngineError("INVALID_INPUT", `VERSUS_${err}`);
        me.move = act.move.type === "ABILITY" ? { type: "ABILITY", abilityId: act.move.abilityId } : { type: act.move.type };
        break;
      }
      case "leave": {
        if (i === -1) break;
        if (s.phase === "LOBBY") {
          s.phase = "ABANDONED";
        } else if (s.phase === "PICK" || s.phase === "BATTLE") {
          finish(s, i === 0 ? 1 : 0, "forfeit", now);
          s.forfeitedBy = userId;
        }
        break;
      }
      case "rematch": {
        if (i === -1) throw new EngineError("NOT_A_PLAYER");
        if (s.phase !== "FINISHED") throw new EngineError("INVALID_STATE");
        if (s.rematchCode) break;
        if (s.mode === "bot") {
          s.rematchCode = await createBotMatchInside(userId, s.botLevel ?? "NORMAL", now);
          break;
        }
        if (s.mode !== "friendly") throw new EngineError("INVALID_STATE");
        if (!s.rematchVotes.includes(userId)) s.rematchVotes.push(userId);
        if (s.seats.every((x) => x.userId && s.rematchVotes.includes(x.userId))) {
          s.rematchCode = await createRematch(s, now);
        }
        break;
      }
    }
  });
  return snapshot(final, userId, Date.now());
}

async function createBotMatchInside(userId: string, level: BotLevel, now: number): Promise<string> {
  void now;
  return createBotMatch(userId, level);
}

async function createRematch(s: VersusState, now: number): Promise<string> {
  const code = await uniqueCode();
  const next: VersusState = {
    ...s,
    code,
    phase: "PICK",
    createdAt: now,
    phaseEndsAt: now + PICK_MS,
    turn: 0,
    seats: s.seats.map((x) => ({ ...x, pick: null, fighter: null, move: null, timeouts: 0, lastSeenAt: now })),
    log: [],
    result: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    rematchVotes: [],
    rematchCode: null,
    recorded: false,
    forfeitedBy: undefined,
  };
  await prisma.versusMatch.create({
    data: { code, mode: next.mode, phase: next.phase, playerIds: next.seats.map((x) => x.userId!).filter(Boolean), state: next as unknown as Prisma.InputJsonValue },
  });
  return code;
}

// ─── Results ───────────────────────────────────────────────────────────────

const REWARDS = {
  ranked: { win: 40, play: 15, winReason: "VERSUS_WIN", playReason: "VERSUS_PLAY" },
  friendly: { win: 25, play: 10, winReason: "VERSUS_FRIENDLY_WIN", playReason: "VERSUS_FRIENDLY_PLAY" },
  bot: { win: 12, play: 4, winReason: "VERSUS_BOT_WIN", playReason: "VERSUS_BOT_PLAY" },
} as const;

async function recordResult(s: VersusState): Promise<void> {
  if (!s.result || s.log.length === 0) {
    // Nothing was played (left during the draft): no history, no rewards.
    if (!s.result || s.result.reason !== "forfeit" || s.mode !== "ranked") return;
  }
  const r = REWARDS[s.mode];
  const humans = s.seats.map((x, i) => ({ x, i })).filter(({ x }) => x.userId);
  let botRewarded = true;
  if (s.mode === "bot" && humans[0]) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const today = await prisma.gameMatchPlayer.count({ where: { userId: humans[0].x.userId!, endedAt: { gte: since }, match: { game: "VERSUS", mode: "bot" } } });
    botRewarded = today < BOT_DAILY_REWARDS;
  }
  await recordGameResult({
    game: "VERSUS",
    mode: s.mode,
    ranked: s.mode === "ranked",
    refId: `${s.code}-${s.createdAt}`,
    startedAt: new Date(s.createdAt),
    players: humans.map(({ x, i }) => {
      const result = s.result!.winner === null ? "DRAW" : s.result!.winner === i ? "WIN" : "LOSS";
      const quit = s.forfeitedBy === x.userId || (s.result!.reason === "timeout" && x.timeouts >= MAX_TIMEOUTS);
      const xp = quit || !botRewarded ? 0 : result === "WIN" ? r.win : r.play;
      return {
        userId: x.userId!,
        result,
        score: x.fighter ? Math.round((x.fighter.hp / x.fighter.kit.maxHp) * 100) : null,
        xp,
        reason: result === "WIN" ? r.winReason : r.playReason,
      };
    }),
  });
}

/** Rating change of a recorded ranked match (for the result screen). */
export async function ratingChangeFor(code: string, createdAt: number, seats: (string | null)[]): Promise<(number | null)[] | null> {
  const m = await prisma.gameMatch.findUnique({ where: { game_refId: { game: "VERSUS", refId: `${code}-${createdAt}` } }, include: { players: true } });
  if (!m) return null;
  return seats.map((id) => {
    const p = m.players.find((x) => x.userId === id);
    return p && p.ratingAfter !== null && p.ratingBefore !== null ? p.ratingAfter - p.ratingBefore : null;
  });
}

export async function viewMatch(rawCode: string, userId: string | null): Promise<VersusSnapshot> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
  const row = await prisma.versusMatch.findUnique({ where: { code } });
  if (!row) throw new EngineError("NOT_FOUND", "VERSUS_NOT_FOUND");
  const s = row.state as unknown as VersusState;
  const change = s.phase === "FINISHED" && s.mode === "ranked" ? await ratingChangeFor(s.code, s.createdAt, s.seats.map((x) => x.userId)) : null;
  return snapshot(s, userId, Date.now(), change);
}

// ─── Ranked matchmaking ────────────────────────────────────────────────────

export interface QueueStatus {
  inQueue: boolean;
  since: number | null;
  matchedCode: string | null;
  rating: number;
}

/** Joins or refreshes the ranked queue and tries to pair the longest-waiting compatible players. */
export async function queuePoll(userId: string, join: boolean): Promise<QueueStatus> {
  const rating = await seasonRating(userId);
  const existing = await prisma.versusQueueEntry.findUnique({ where: { userId } });
  if (existing?.matchedCode) {
    await prisma.versusQueueEntry.deleteMany({ where: { userId } });
    return { inQueue: false, since: null, matchedCode: existing.matchedCode, rating };
  }
  if (!existing && !join) return { inQueue: false, since: null, matchedCode: null, rating };
  if (!existing) await ensureFree(userId);

  return exclusive(
    "versus-queue",
    async (tx) => {
      const now = Date.now();
      const me = await tx.versusQueueEntry.upsert({
        where: { userId },
        create: { userId, rating, since: new Date(now), lastSeenAt: new Date(now) },
        update: { lastSeenAt: new Date(now), rating },
      });
      if (me.matchedCode) {
        await tx.versusQueueEntry.deleteMany({ where: { userId } });
        return { inQueue: false, since: null, matchedCode: me.matchedCode, rating };
      }
      const waiting = await tx.versusQueueEntry.findMany({
        where: { matchedCode: null, userId: { not: userId }, lastSeenAt: { gte: new Date(now - QUEUE_STALE_MS) } },
        orderBy: { since: "asc" },
      });
      // The rating window widens the longer you wait.
      const waitedS = (now - new Date(me.since).getTime()) / 1000;
      const window = Math.min(600, 100 + waitedS * 10);
      const other = waiting.find((w) => Math.abs(w.rating - rating) <= window);
      if (!other) return { inQueue: true, since: new Date(me.since).getTime(), matchedCode: null, rating };
      const code = await createRankedMatch(tx, other.userId, userId, now);
      await tx.versusQueueEntry.update({ where: { userId: other.userId }, data: { matchedCode: code } });
      await tx.versusQueueEntry.deleteMany({ where: { userId } });
      return { inQueue: false, since: null, matchedCode: code, rating };
    },
    (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(7314002)`,
  );
}

export async function queueLeave(userId: string): Promise<void> {
  await prisma.versusQueueEntry.deleteMany({ where: { userId, matchedCode: null } });
}
