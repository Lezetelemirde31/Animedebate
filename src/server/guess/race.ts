/**
 * "Who Is This Character?" — race rooms.
 *
 * Everyone sees the same disguised picture at the same time; it gets clearer
 * every few seconds for all players. The first correct answers score the
 * most. Rooms are friendly (2–8 players, invite link or code) or ranked
 * (two players paired by the queue; rating changes).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  LAST_STAGE,
  RACE_MAX_PLAYERS,
  RACE_ROUND_CHOICES,
  RACE_WRONG_LIMIT,
  ROUND_SECONDS,
  hintsFor,
  isDifficulty,
  isRunMode,
  modesFor,
  pickCharacters,
  poolFor,
  racePoints,
  raceStage,
  type Difficulty,
  type GuessMode,
  type RunMode,
} from "@/game/guess/rules";
import { generateRoomCode, normalizeRoomCode } from "@/game/rules";
import type { AvatarDTO } from "@/game/types";
import { isEnabledAnime } from "@/data/anime";
import { EngineError } from "../live/room";
import { recordGameResult } from "../platform/results";
import { answerOf, exclusive, guessCharacters, guessRating, profileOf, type GuessAnswer, type Tx } from "./shared";

export type RaceMode = "friendly" | "ranked";
export type RacePhase = "LOBBY" | "PLAYING" | "FINISHED" | "ABANDONED";

export const COUNTDOWN_MS = 4_000;
export const REVEAL_MS = 4_000;
const LOBBY_TTL_MS = 30 * 60_000;
const QUEUE_STALE_MS = 15_000;
const RANKED_ROUNDS = 8;

export interface RaceSettings {
  mode: RunMode;
  difficulty: Difficulty;
  animeId: string | null;
  rounds: number;
}

interface RacePlayer {
  userId: string;
  username: string;
  avatar: AvatarDTO;
  rating: number | null;
  score: number;
  correct: number;
  lastSeenAt: number;
  left: boolean;
}

interface RaceRound {
  c: string;
  m: GuessMode;
  startedAt: number | null;
  endsAt: number | null;
  closedAt: number | null;
  answers: Record<string, { at: number; stage: number; points: number; order: number }>;
  wrong: Record<string, string[]>;
}

interface RaceState {
  code: string;
  mode: RaceMode;
  phase: RacePhase;
  hostId: string;
  settings: RaceSettings;
  players: RacePlayer[];
  rounds: RaceRound[];
  index: number;
  createdAt: number;
  startedAt: number | null;
  result: { reason: "complete" | "forfeit"; standings: { userId: string; score: number; correct: number; place: number }[] } | null;
  recorded: boolean;
  rematchCode: string | null;
  seed: number;
}

export const DEFAULT_SETTINGS: RaceSettings = { mode: "MIXED", difficulty: "NORMAL", animeId: null, rounds: 8 };

// ─── View ─────────────────────────────────────────────────────────────────

export interface RacePlayerView {
  userId: string;
  username: string;
  avatar: AvatarDTO;
  rating: number | null;
  score: number;
  correct: number;
  connected: boolean;
  left: boolean;
  isHost: boolean;
  /** This round: answered correctly (order 0 = first), or locked out after too many wrong guesses. */
  answered: { order: number; points: number } | null;
  wrongCount: number;
}

export interface RaceView {
  code: string;
  mode: RaceMode;
  phase: RacePhase;
  hostId: string;
  settings: RaceSettings;
  createdAt: number;
  serverNow: number;
  me: string | null;
  players: RacePlayerView[];
  round: {
    number: number;
    total: number;
    mode: GuessMode;
    startedAt: number;
    endsAt: number;
    closedAt: number | null;
    nextAt: number | null;
    stage: number;
    image: string;
    hints: { animeId: string | null; initials: string | null };
    myGuesses: { id: string; name: string }[];
    answer: GuessAnswer | null;
  } | null;
  result: RaceState["result"];
  rematchCode: string | null;
  ratingChange: Record<string, number> | null;
}

function view(s: RaceState, viewerId: string | null, now: number, byId: Map<string, { id: string; name: string; animeId: string; imageUrl: string | null }>, ratingChange: Record<string, number> | null = null): RaceView {
  const r = s.phase === "PLAYING" || s.phase === "FINISHED" ? s.rounds[s.index] : null;
  const started = r && r.startedAt !== null;
  const c = r ? byId.get(r.c) : undefined;
  const closed = !!r && r.closedAt !== null;
  const stage = r && started ? (closed ? LAST_STAGE : raceStage(now - r.startedAt!)) : 0;
  const me = viewerId && s.players.some((p) => p.userId === viewerId) ? viewerId : null;
  return {
    code: s.code,
    mode: s.mode,
    phase: s.phase,
    hostId: s.hostId,
    settings: s.settings,
    createdAt: s.createdAt,
    serverNow: now,
    me,
    players: s.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
      rating: p.rating,
      score: p.score,
      correct: p.correct,
      connected: now - p.lastSeenAt < 15_000,
      left: p.left,
      isHost: p.userId === s.hostId,
      answered: r?.answers[p.userId] ? { order: r.answers[p.userId].order, points: r.answers[p.userId].points } : null,
      wrongCount: r?.wrong[p.userId]?.length ?? 0,
    })),
    round:
      r && started
        ? {
            number: s.index + 1,
            total: s.rounds.length,
            mode: r.m,
            startedAt: r.startedAt!,
            endsAt: r.endsAt!,
            closedAt: r.closedAt,
            nextAt: r.closedAt !== null && s.phase === "PLAYING" ? r.closedAt + REVEAL_MS : null,
            stage,
            image: `/api/guess/rooms/${s.code}/image?r=${s.index}&s=${stage}&t=${r.startedAt}`,
            hints: c && now >= r.startedAt! ? hintsFor(stage, c) : { animeId: null, initials: null },
            myGuesses: me ? (r.wrong[me] ?? []).map((id) => ({ id, name: byId.get(id)?.name ?? "?" })) : [],
            answer: closed ? answerOf(c as never) : null,
          }
        : null,
    result: s.result,
    rematchCode: s.rematchCode,
    ratingChange,
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────

async function save(tx: Tx, s: RaceState): Promise<void> {
  const data = {
    mode: s.mode,
    phase: s.phase,
    playerIds: s.players.filter((p) => !p.left).map((p) => p.userId),
    state: s as unknown as Prisma.InputJsonValue,
  };
  await tx.guessRoom.upsert({ where: { code: s.code }, create: { code: s.code, ...data }, update: data });
}

async function withRoom(code: string, fn: (s: RaceState, now: number) => Promise<void> | void): Promise<RaceState> {
  let toRecord: RaceState | null = null;
  const out = await exclusive(
    `guess-room:${code}`,
    async (tx) => {
      const row = await tx.guessRoom.findUnique({ where: { code } });
      if (!row) throw new EngineError("NOT_FOUND", "GUESS_ROOM_NOT_FOUND");
      const s = row.state as unknown as RaceState;
      const now = Date.now();
      advance(s, now);
      await fn(s, now);
      advance(s, Date.now());
      if (s.result && !s.recorded) {
        s.recorded = true;
        toRecord = structuredClone(s);
      }
      await save(tx, s);
      return s;
    },
    (tx) => tx.$queryRaw`SELECT "code" FROM "GuessRoom" WHERE "code" = ${code} FOR UPDATE`,
  );
  if (toRecord) await recordRace(toRecord).catch((err) => console.error("[guess] race record failed", err));
  return out;
}

async function uniqueCode(tx: Tx | typeof prisma = prisma): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = generateRoomCode();
    if (!(await tx.guessRoom.findUnique({ where: { code } }))) return code;
  }
  throw new EngineError("SERVER_ERROR");
}

// ─── Flow ─────────────────────────────────────────────────────────────────

const active = (s: RaceState) => s.players.filter((p) => !p.left);

function finish(s: RaceState, reason: "complete" | "forfeit"): void {
  const ranked = [...s.players].sort((a, b) => Number(a.left) - Number(b.left) || b.score - a.score || b.correct - a.correct);
  let place = 0;
  const standings = ranked.map((p, i) => {
    const prev = ranked[i - 1];
    if (!prev || prev.left !== p.left || prev.score !== p.score || prev.correct !== p.correct) place = i + 1;
    return { userId: p.userId, score: p.score, correct: p.correct, place };
  });
  s.result = { reason, standings };
  s.phase = "FINISHED";
}

function startRace(s: RaceState, pool: { id: string }[], now: number): void {
  const chars = pickCharacters(pool, s.settings.rounds, s.seed);
  const modes = modesFor(s.settings.mode, chars.length, s.seed);
  s.rounds = chars.map((c, i) => ({ c: c.id, m: modes[i], startedAt: null, endsAt: null, closedAt: null, answers: {}, wrong: {} }));
  s.index = 0;
  s.rounds[0].startedAt = now + COUNTDOWN_MS;
  s.rounds[0].endsAt = now + COUNTDOWN_MS + ROUND_SECONDS * 1000;
  s.phase = "PLAYING";
  s.startedAt = now;
  for (const p of s.players) {
    p.score = 0;
    p.correct = 0;
  }
}

/** A round closes when time runs out or every active player has answered or used up their guesses. */
function roundDone(s: RaceState, r: RaceRound): boolean {
  return active(s).every((p) => r.answers[p.userId] || (r.wrong[p.userId]?.length ?? 0) >= RACE_WRONG_LIMIT);
}

function advance(s: RaceState, now: number): void {
  if (s.phase === "LOBBY") {
    if (now - s.createdAt > LOBBY_TTL_MS) s.phase = "ABANDONED";
    return;
  }
  for (let guard = 0; guard < 40 && s.phase === "PLAYING"; guard++) {
    if (active(s).length < 2) {
      finish(s, "forfeit");
      return;
    }
    const r = s.rounds[s.index];
    if (r.closedAt === null) {
      if (now >= r.endsAt!) r.closedAt = r.endsAt!;
      else if (now >= r.startedAt! && roundDone(s, r)) r.closedAt = now;
      else return;
    }
    const nextAt = r.closedAt + REVEAL_MS;
    if (now < nextAt) return;
    if (s.index >= s.rounds.length - 1) {
      finish(s, "complete");
      return;
    }
    s.index += 1;
    const n = s.rounds[s.index];
    n.startedAt = nextAt;
    n.endsAt = nextAt + ROUND_SECONDS * 1000;
  }
}

// ─── Rooms ────────────────────────────────────────────────────────────────

function player(userId: string, username: string, avatar: AvatarDTO, rating: number | null, now: number): RacePlayer {
  return { userId, username, avatar, rating, score: 0, correct: 0, lastSeenAt: now, left: false };
}

/** A room this user is still part of (lobby or running), if any. */
export async function activeRoomOf(userId: string): Promise<string | null> {
  const rows = await prisma.guessRoom.findMany({
    where: { playerIds: { has: userId }, phase: { in: ["LOBBY", "PLAYING"] } },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  for (const row of rows) {
    const s = row.state as unknown as RaceState;
    advance(s, Date.now());
    if ((s.phase === "LOBBY" || s.phase === "PLAYING") && s.players.some((p) => p.userId === userId && !p.left)) return s.code;
  }
  return null;
}

async function ensureFree(userId: string, except?: string): Promise<void> {
  const busy = await activeRoomOf(userId);
  if (busy && busy !== except) throw new EngineError("ACTIVE_MATCH", "GUESS_ACTIVE", { code: busy }, { code: busy });
}

export function cleanSettings(input: Partial<RaceSettings> | null | undefined, base: RaceSettings = DEFAULT_SETTINGS): RaceSettings {
  const rounds = Number(input?.rounds);
  return {
    mode: isRunMode(input?.mode) ? input!.mode : base.mode,
    difficulty: isDifficulty(input?.difficulty) ? input!.difficulty : base.difficulty,
    animeId: input?.animeId === null ? null : typeof input?.animeId === "string" && isEnabledAnime(input.animeId) ? input.animeId : base.animeId,
    rounds: (RACE_ROUND_CHOICES as readonly number[]).includes(rounds) ? rounds : base.rounds,
  };
}

export async function createRaceRoom(userId: string, settings?: Partial<RaceSettings>): Promise<string> {
  await ensureFree(userId);
  const me = await profileOf(userId);
  const now = Date.now();
  const s: RaceState = {
    code: await uniqueCode(),
    mode: "friendly",
    phase: "LOBBY",
    hostId: userId,
    settings: cleanSettings(settings),
    players: [player(userId, me.username, me.avatar, null, now)],
    rounds: [],
    index: 0,
    createdAt: now,
    startedAt: null,
    result: null,
    recorded: false,
    rematchCode: null,
    seed: Math.floor(Math.random() * 2 ** 31),
  };
  await prisma.guessRoom.create({ data: { code: s.code, mode: s.mode, phase: s.phase, playerIds: [userId], state: s as unknown as Prisma.InputJsonValue } });
  return s.code;
}

export type RaceAction =
  | { action: "sync" }
  | { action: "join" }
  | { action: "leave" }
  | { action: "start" }
  | { action: "settings"; settings: Partial<RaceSettings> }
  | { action: "guess"; characterId: string; round: number }
  | { action: "rematch" };

export async function raceRequest(rawCode: string, userId: string, act: RaceAction): Promise<RaceView> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
  const chars = await guessCharacters();
  let joinProfile: { username: string; avatar: AvatarDTO } | null = null;
  if (act.action === "join") {
    const row = await prisma.guessRoom.findUnique({ where: { code } });
    if (row && row.phase === "LOBBY" && !row.playerIds.includes(userId)) {
      await ensureFree(userId, code);
      joinProfile = await profileOf(userId);
    }
  }
  let rematchFor: RaceState | null = null;

  const s = await withRoom(code, async (s, now) => {
    const me = s.players.find((p) => p.userId === userId);
    if (me && !me.left) me.lastSeenAt = now;
    switch (act.action) {
      case "sync":
        break;
      case "join":
        if (!me && s.phase === "LOBBY" && joinProfile) {
          if (s.players.length >= RACE_MAX_PLAYERS) throw new EngineError("ROOM_FULL", "GUESS_ROOM_FULL");
          s.players.push(player(userId, joinProfile.username, joinProfile.avatar, null, now));
        } else if (me?.left && s.phase === "LOBBY") {
          me.left = false;
          me.lastSeenAt = now;
        }
        break;
      case "leave":
        if (!me || me.left) break;
        if (s.phase === "LOBBY") {
          s.players = s.players.filter((p) => p.userId !== userId);
          if (s.players.length === 0) s.phase = "ABANDONED";
          else if (s.hostId === userId) s.hostId = s.players[0].userId;
        } else if (s.phase === "PLAYING") {
          me.left = true;
          if (s.hostId === userId) s.hostId = active(s)[0]?.userId ?? s.hostId;
        }
        break;
      case "settings":
        if (!me || me.left) throw new EngineError("NOT_A_PLAYER");
        if (s.phase !== "LOBBY") throw new EngineError("INVALID_STATE", "GUESS_ALREADY_STARTED");
        if (s.hostId !== userId) throw new EngineError("FORBIDDEN", "GUESS_HOST_ONLY");
        s.settings = cleanSettings(act.settings, s.settings);
        break;
      case "start": {
        if (!me || me.left) throw new EngineError("NOT_A_PLAYER");
        if (s.phase !== "LOBBY") throw new EngineError("INVALID_STATE", "GUESS_ALREADY_STARTED");
        if (s.hostId !== userId) throw new EngineError("FORBIDDEN", "GUESS_HOST_ONLY");
        if (s.players.length < 2) throw new EngineError("INVALID_STATE", "GUESS_NEED_PLAYERS");
        const pool = poolFor(chars.list, s.settings);
        if (pool.length < s.settings.rounds) throw new EngineError("INVALID_INPUT", "GUESS_POOL_SMALL");
        startRace(s, pool, now);
        break;
      }
      case "guess": {
        if (!me || me.left) throw new EngineError("NOT_A_PLAYER");
        if (s.phase !== "PLAYING") throw new EngineError("INVALID_STATE", "GUESS_ROUND_OVER");
        const r = s.rounds[s.index];
        if (act.round !== s.index || r.closedAt !== null || now < r.startedAt!) throw new EngineError("INVALID_STATE", "GUESS_ROUND_OVER");
        if (r.answers[userId]) throw new EngineError("INVALID_STATE", "GUESS_ALREADY_ANSWERED");
        const wrong = (r.wrong[userId] ??= []);
        if (wrong.length >= RACE_WRONG_LIMIT) throw new EngineError("INVALID_STATE", "GUESS_NO_TRIES");
        if (typeof act.characterId !== "string" || !chars.byId.has(act.characterId)) throw new EngineError("INVALID_INPUT", "GUESS_BAD_CHARACTER");
        if (wrong.includes(act.characterId)) throw new EngineError("INVALID_STATE", "GUESS_ALREADY_TRIED");
        if (act.characterId === r.c) {
          const order = Object.keys(r.answers).length;
          const stage = raceStage(now - r.startedAt!);
          const points = racePoints(stage, order);
          r.answers[userId] = { at: now, stage, points, order };
          me.score += points;
          me.correct += 1;
        } else {
          wrong.push(act.characterId);
        }
        break;
      }
      case "rematch":
        if (!me) throw new EngineError("NOT_A_PLAYER");
        if (s.phase !== "FINISHED" || s.mode !== "friendly") throw new EngineError("INVALID_STATE");
        if (!s.rematchCode) rematchFor = s;
        break;
    }
  });

  if (rematchFor) {
    // A new lobby with the same settings; the others can follow with one click.
    const next = await createRaceRoom(userId, (rematchFor as RaceState).settings);
    const updated = await withRoom(code, (st) => {
      st.rematchCode ??= next;
    });
    s.rematchCode = updated.rematchCode;
  }

  const change = s.phase === "FINISHED" && s.mode === "ranked" ? await ratingChangeFor(s) : null;
  return view(s, userId, Date.now(), chars.byId, change);
}

export async function viewRace(rawCode: string, userId: string | null): Promise<RaceView> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
  const row = await prisma.guessRoom.findUnique({ where: { code } });
  if (!row) throw new EngineError("NOT_FOUND", "GUESS_ROOM_NOT_FOUND");
  const s = row.state as unknown as RaceState;
  advance(s, Date.now());
  const chars = await guessCharacters();
  return view(s, userId, Date.now(), chars.byId, s.phase === "FINISHED" && s.mode === "ranked" ? await ratingChangeFor(s) : null);
}

/** What the image route may show for round `r` at stage `stage` (players only). */
export async function raceImageTarget(rawCode: string, userId: string, r: number, stage: number) {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
  const row = await prisma.guessRoom.findUnique({ where: { code } });
  if (!row) throw new EngineError("NOT_FOUND", "GUESS_ROOM_NOT_FOUND");
  const s = row.state as unknown as RaceState;
  if (!s.players.some((p) => p.userId === userId)) throw new EngineError("FORBIDDEN", "FORBIDDEN");
  const now = Date.now();
  advance(s, now);
  const round = s.rounds[r];
  if (!round || r > s.index || round.startedAt === null || !Number.isInteger(stage) || stage < 0 || stage > LAST_STAGE) throw new EngineError("INVALID_INPUT");
  if (now < round.startedAt - 300) throw new EngineError("FORBIDDEN", "FORBIDDEN");
  // A running round only shows the stages already revealed to everyone.
  if (round.closedAt === null && r === s.index && stage > raceStage(now - round.startedAt + 400)) throw new EngineError("FORBIDDEN", "FORBIDDEN");
  const c = (await guessCharacters()).byId.get(round.c);
  if (!c?.imageUrl) throw new EngineError("NOT_FOUND", "NOT_FOUND");
  return { imageUrl: c.imageUrl, mode: round.m, difficulty: s.settings.difficulty };
}

// ─── Results ──────────────────────────────────────────────────────────────

const REWARDS = {
  ranked: { win: 40, play: 15, winReason: "GUESS_RANKED_WIN", playReason: "GUESS_RANKED_PLAY" },
  friendly: { win: 25, play: 10, winReason: "GUESS_RACE_WIN", playReason: "GUESS_RACE_PLAY" },
} as const;

async function recordRace(s: RaceState): Promise<void> {
  if (!s.result) return;
  const played = s.rounds.some((r) => r.closedAt !== null);
  // Nobody played a round (everyone left during the countdown): only a ranked forfeit counts.
  if (!played && !(s.mode === "ranked" && s.result.reason === "forfeit")) return;
  const rw = REWARDS[s.mode];
  const tiedTop = s.result.standings.filter((x) => x.place === 1).length;
  await recordGameResult({
    game: "GUESS",
    mode: s.mode === "ranked" ? "ranked" : "race",
    ranked: s.mode === "ranked",
    refId: `room-${s.code}-${s.createdAt}`,
    startedAt: s.startedAt ? new Date(s.startedAt) : null,
    players: s.result.standings.map((st) => {
      const p = s.players.find((x) => x.userId === st.userId)!;
      const result = p.left ? "LOSS" : st.place === 1 ? (tiedTop > 1 && s.players.length === 2 ? "DRAW" : "WIN") : "LOSS";
      return {
        userId: st.userId,
        result,
        score: st.score,
        xp: p.left ? 0 : result === "WIN" ? rw.win : rw.play,
        reason: result === "WIN" ? rw.winReason : rw.playReason,
      };
    }),
  });
}

async function ratingChangeFor(s: RaceState): Promise<Record<string, number> | null> {
  const m = await prisma.gameMatch.findUnique({ where: { game_refId: { game: "GUESS", refId: `room-${s.code}-${s.createdAt}` } }, include: { players: true } });
  if (!m) return null;
  const out: Record<string, number> = {};
  for (const p of m.players) if (p.ratingAfter !== null && p.ratingBefore !== null) out[p.userId] = p.ratingAfter - p.ratingBefore;
  return out;
}

// ─── Ranked queue ─────────────────────────────────────────────────────────

export interface GuessQueueStatus {
  inQueue: boolean;
  since: number | null;
  matchedCode: string | null;
  rating: number;
}

async function createRankedRoom(tx: Tx, a: string, b: string, now: number): Promise<string> {
  const [pa, pb, ra, rb, chars] = await Promise.all([profileOf(a), profileOf(b), guessRating(a), guessRating(b), guessCharacters()]);
  const s: RaceState = {
    code: await uniqueCode(tx),
    mode: "ranked",
    phase: "LOBBY",
    hostId: a,
    settings: { mode: "MIXED", difficulty: "NORMAL", animeId: null, rounds: RANKED_ROUNDS },
    players: [player(a, pa.username, pa.avatar, ra, now), player(b, pb.username, pb.avatar, rb, now)],
    rounds: [],
    index: 0,
    createdAt: now,
    startedAt: null,
    result: null,
    recorded: false,
    rematchCode: null,
    seed: Math.floor(Math.random() * 2 ** 31),
  };
  startRace(s, poolFor(chars.list, s.settings), now);
  await save(tx, s);
  return s.code;
}

export async function guessQueuePoll(userId: string, join: boolean): Promise<GuessQueueStatus> {
  const rating = await guessRating(userId);
  const existing = await prisma.guessQueueEntry.findUnique({ where: { userId } });
  if (existing?.matchedCode) {
    await prisma.guessQueueEntry.deleteMany({ where: { userId } });
    return { inQueue: false, since: null, matchedCode: existing.matchedCode, rating };
  }
  if (!existing && !join) return { inQueue: false, since: null, matchedCode: null, rating };
  if (!existing) await ensureFree(userId);

  return exclusive(
    "guess-queue",
    async (tx) => {
      const now = Date.now();
      const me = await tx.guessQueueEntry.upsert({
        where: { userId },
        create: { userId, rating, since: new Date(now), lastSeenAt: new Date(now) },
        update: { lastSeenAt: new Date(now), rating },
      });
      if (me.matchedCode) {
        await tx.guessQueueEntry.deleteMany({ where: { userId } });
        return { inQueue: false, since: null, matchedCode: me.matchedCode, rating };
      }
      const waiting = await tx.guessQueueEntry.findMany({
        where: { matchedCode: null, userId: { not: userId }, lastSeenAt: { gte: new Date(now - QUEUE_STALE_MS) } },
        orderBy: { since: "asc" },
      });
      const waitedS = (now - new Date(me.since).getTime()) / 1000;
      const window = Math.min(600, 100 + waitedS * 10);
      const other = waiting.find((w) => Math.abs(w.rating - rating) <= window);
      if (!other) return { inQueue: true, since: new Date(me.since).getTime(), matchedCode: null, rating };
      const code = await createRankedRoom(tx, other.userId, userId, now);
      await tx.guessQueueEntry.update({ where: { userId: other.userId }, data: { matchedCode: code } });
      await tx.guessQueueEntry.deleteMany({ where: { userId } });
      return { inQueue: false, since: null, matchedCode: code, rating };
    },
    (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(7314003)`,
  );
}

export async function guessQueueLeave(userId: string): Promise<void> {
  await prisma.guessQueueEntry.deleteMany({ where: { userId, matchedCode: null } });
}
