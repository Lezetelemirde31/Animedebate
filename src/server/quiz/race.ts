/**
 * Anime Quiz — race rooms. Everyone gets the same question at the same time;
 * each player sees the options in their own order (so screens can't be
 * copied), answers once, and faster correct answers score more.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  QUESTION_SECONDS,
  RACE_MAX_PLAYERS,
  RACE_QUESTION_CHOICES,
  hashString,
  isQuizDifficulty,
  quizRacePoints,
  seededRandom,
  shuffle,
  type QuizDifficulty,
} from "@/game/quiz/rules";
import { generateRoomCode, normalizeRoomCode } from "@/game/rules";
import type { AvatarDTO } from "@/game/types";
import { isEnabledAnime } from "@/data/anime";
import { EngineError } from "../live/room";
import { recordGameResult } from "../platform/results";
import { exclusive, profileOf, type Tx } from "../guess/shared";
import { pickQuestions, type QuizItem } from "./questions";
import { quizCharacters, quizRating } from "./shared";

export type QuizRaceMode = "friendly" | "ranked";
export type QuizRacePhase = "LOBBY" | "PLAYING" | "FINISHED" | "ABANDONED";

export const QUIZ_COUNTDOWN_MS = 4_000;
export const QUIZ_REVEAL_MS = 3_500;
const LOBBY_TTL_MS = 30 * 60_000;
const QUEUE_STALE_MS = 15_000;
const RANKED_QUESTIONS = 10;

export interface QuizRaceSettings {
  difficulty: QuizDifficulty;
  animeId: string | null;
  questions: number;
}

interface Player {
  userId: string;
  username: string;
  avatar: AvatarDTO;
  rating: number | null;
  score: number;
  correct: number;
  lastSeenAt: number;
  left: boolean;
}

interface Round {
  startedAt: number | null;
  endsAt: number | null;
  closedAt: number | null;
  /** Real option index chosen by each player. */
  answers: Record<string, { choice: number; at: number; correct: boolean; points: number }>;
}

interface RaceState {
  code: string;
  mode: QuizRaceMode;
  phase: QuizRacePhase;
  hostId: string;
  settings: QuizRaceSettings;
  players: Player[];
  items: QuizItem[];
  rounds: Round[];
  index: number;
  createdAt: number;
  startedAt: number | null;
  result: { reason: "complete" | "forfeit"; standings: { userId: string; score: number; correct: number; place: number }[] } | null;
  recorded: boolean;
  rematchCode: string | null;
  seed: number;
}

const DEFAULT_SETTINGS: QuizRaceSettings = { difficulty: "MIXED", animeId: null, questions: 10 };

/** The order a player sees the four options in (different for every player and question). */
export function optionOrder(seed: number, userId: string, index: number): number[] {
  return shuffle([0, 1, 2, 3], seededRandom(seed ^ hashString(userId) ^ Math.imul(index + 1, 7919)));
}

// ─── View ─────────────────────────────────────────────────────────────────

export interface QuizRaceView {
  code: string;
  mode: QuizRaceMode;
  phase: QuizRacePhase;
  hostId: string;
  settings: QuizRaceSettings;
  createdAt: number;
  serverNow: number;
  me: string | null;
  players: {
    userId: string;
    username: string;
    avatar: AvatarDTO;
    rating: number | null;
    score: number;
    correct: number;
    connected: boolean;
    left: boolean;
    isHost: boolean;
    /** This question: answered (right or wrong is only shown once the question closes). */
    answered: boolean;
    gotIt: boolean | null;
    points: number | null;
  }[];
  question: {
    number: number;
    total: number;
    animeId: string;
    category: string;
    q: { tr: string; en: string };
    /** Options in this player's own order. */
    options: { tr: string[]; en: string[] };
    startedAt: number;
    endsAt: number;
    closedAt: number | null;
    nextAt: number | null;
    /** My answer (index in my order). */
    myChoice: number | null;
    /** Correct option in my order, once the question is closed or I answered. */
    correct: number | null;
  } | null;
  result: RaceState["result"];
  rematchCode: string | null;
  ratingChange: Record<string, number> | null;
}

function view(s: RaceState, viewerId: string | null, now: number, ratingChange: Record<string, number> | null = null): QuizRaceView {
  const live = s.phase === "PLAYING" || s.phase === "FINISHED";
  const r = live ? s.rounds[s.index] : null;
  const item = live ? s.items[s.index] : null;
  const me = viewerId && s.players.some((p) => p.userId === viewerId) ? viewerId : null;
  const closed = !!r && r.closedAt !== null;
  const started = !!r && r.startedAt !== null && now >= r.startedAt;
  const order = optionOrder(s.seed, me ?? "spectator", s.index);
  const mine = me && r ? r.answers[me] : undefined;
  return {
    code: s.code,
    mode: s.mode,
    phase: s.phase,
    hostId: s.hostId,
    settings: s.settings,
    createdAt: s.createdAt,
    serverNow: now,
    me,
    players: s.players.map((p) => {
      const a = r?.answers[p.userId];
      return {
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        rating: p.rating,
        score: p.score,
        correct: p.correct,
        connected: now - p.lastSeenAt < 15_000,
        left: p.left,
        isHost: p.userId === s.hostId,
        answered: !!a,
        gotIt: a && (closed || p.userId === me) ? a.correct : null,
        points: a && (closed || p.userId === me) ? a.points : null,
      };
    }),
    question:
      r && item && r.startedAt !== null
        ? {
            number: s.index + 1,
            total: s.items.length,
            animeId: item.animeId,
            category: item.category,
            // Nothing about the question is shown before it starts.
            q: started ? { tr: item.tr.q, en: item.en.q } : { tr: "", en: "" },
            options: started ? { tr: order.map((i) => item.tr.options[i]), en: order.map((i) => item.en.options[i]) } : { tr: [], en: [] },
            startedAt: r.startedAt,
            endsAt: r.endsAt!,
            closedAt: r.closedAt,
            nextAt: r.closedAt !== null && s.phase === "PLAYING" ? r.closedAt + QUIZ_REVEAL_MS : null,
            myChoice: mine ? order.indexOf(mine.choice) : null,
            correct: closed || mine ? order.indexOf(item.correct) : null,
          }
        : null,
    result: s.result,
    rematchCode: s.rematchCode,
    ratingChange,
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────

async function save(tx: Tx, s: RaceState): Promise<void> {
  const data = { mode: s.mode, phase: s.phase, playerIds: s.players.filter((p) => !p.left).map((p) => p.userId), state: s as unknown as Prisma.InputJsonValue };
  await tx.quizRoom.upsert({ where: { code: s.code }, create: { code: s.code, ...data }, update: data });
}

async function withRoom(code: string, fn: (s: RaceState, now: number) => Promise<void> | void): Promise<RaceState> {
  let toRecord: RaceState | null = null;
  const out = await exclusive(
    `quiz-room:${code}`,
    async (tx) => {
      const row = await tx.quizRoom.findUnique({ where: { code } });
      if (!row) throw new EngineError("NOT_FOUND", "QUIZ_ROOM_NOT_FOUND");
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
    (tx) => tx.$queryRaw`SELECT "code" FROM "QuizRoom" WHERE "code" = ${code} FOR UPDATE`,
  );
  if (toRecord) await recordRace(toRecord).catch((err) => console.error("[quiz] race record failed", err));
  return out;
}

async function uniqueCode(tx: Tx | typeof prisma = prisma): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = generateRoomCode();
    if (!(await tx.quizRoom.findUnique({ where: { code } }))) return code;
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

function begin(s: RaceState, items: QuizItem[], now: number): void {
  s.items = items;
  s.rounds = items.map(() => ({ startedAt: null, endsAt: null, closedAt: null, answers: {} }));
  s.index = 0;
  s.rounds[0].startedAt = now + QUIZ_COUNTDOWN_MS;
  s.rounds[0].endsAt = now + QUIZ_COUNTDOWN_MS + QUESTION_SECONDS * 1000;
  s.phase = "PLAYING";
  s.startedAt = now;
  for (const p of s.players) {
    p.score = 0;
    p.correct = 0;
  }
}

function advance(s: RaceState, now: number): void {
  if (s.phase === "LOBBY") {
    if (now - s.createdAt > LOBBY_TTL_MS) s.phase = "ABANDONED";
    return;
  }
  for (let guard = 0; guard < 40 && s.phase === "PLAYING"; guard++) {
    if (active(s).length < 2) return finish(s, "forfeit");
    const r = s.rounds[s.index];
    if (r.closedAt === null) {
      if (now >= r.endsAt!) r.closedAt = r.endsAt!;
      else if (now >= r.startedAt! && active(s).every((p) => r.answers[p.userId])) r.closedAt = now;
      else return;
    }
    const nextAt = r.closedAt + QUIZ_REVEAL_MS;
    if (now < nextAt) return;
    if (s.index >= s.items.length - 1) return finish(s, "complete");
    s.index += 1;
    s.rounds[s.index].startedAt = nextAt;
    s.rounds[s.index].endsAt = nextAt + QUESTION_SECONDS * 1000;
  }
}

function player(userId: string, username: string, avatar: AvatarDTO, rating: number | null, now: number): Player {
  return { userId, username, avatar, rating, score: 0, correct: 0, lastSeenAt: now, left: false };
}

export function cleanQuizSettings(input: Partial<QuizRaceSettings> | null | undefined, base: QuizRaceSettings = DEFAULT_SETTINGS): QuizRaceSettings {
  const n = Number(input?.questions);
  return {
    difficulty: isQuizDifficulty(input?.difficulty) ? input!.difficulty : base.difficulty,
    animeId: input?.animeId === null ? null : typeof input?.animeId === "string" && isEnabledAnime(input.animeId) ? input.animeId : base.animeId,
    questions: (RACE_QUESTION_CHOICES as readonly number[]).includes(n) ? n : base.questions,
  };
}

// ─── Rooms ────────────────────────────────────────────────────────────────

export async function activeQuizRoomOf(userId: string): Promise<string | null> {
  const rows = await prisma.quizRoom.findMany({ where: { playerIds: { has: userId }, phase: { in: ["LOBBY", "PLAYING"] } }, orderBy: { updatedAt: "desc" }, take: 3 });
  for (const row of rows) {
    const s = row.state as unknown as RaceState;
    advance(s, Date.now());
    if ((s.phase === "LOBBY" || s.phase === "PLAYING") && s.players.some((p) => p.userId === userId && !p.left)) return s.code;
  }
  return null;
}

async function ensureFree(userId: string, except?: string): Promise<void> {
  const busy = await activeQuizRoomOf(userId);
  if (busy && busy !== except) throw new EngineError("ACTIVE_MATCH", "QUIZ_ACTIVE", { code: busy }, { code: busy });
}

export async function createQuizRoom(userId: string, settings?: Partial<QuizRaceSettings>): Promise<string> {
  await ensureFree(userId);
  const me = await profileOf(userId);
  const now = Date.now();
  const s: RaceState = {
    code: await uniqueCode(),
    mode: "friendly",
    phase: "LOBBY",
    hostId: userId,
    settings: cleanQuizSettings(settings),
    players: [player(userId, me.username, me.avatar, null, now)],
    items: [],
    rounds: [],
    index: 0,
    createdAt: now,
    startedAt: null,
    result: null,
    recorded: false,
    rematchCode: null,
    seed: Math.floor(Math.random() * 2 ** 31),
  };
  await prisma.quizRoom.create({ data: { code: s.code, mode: s.mode, phase: s.phase, playerIds: [userId], state: s as unknown as Prisma.InputJsonValue } });
  return s.code;
}

export type QuizRaceAction =
  | { action: "sync" }
  | { action: "join" }
  | { action: "leave" }
  | { action: "start" }
  | { action: "settings"; settings: Partial<QuizRaceSettings> }
  | { action: "answer"; choice: number; question: number }
  | { action: "rematch" };

export async function quizRaceRequest(rawCode: string, userId: string, act: QuizRaceAction): Promise<QuizRaceView> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
  let joinProfile: { username: string; avatar: AvatarDTO } | null = null;
  if (act.action === "join") {
    const row = await prisma.quizRoom.findUnique({ where: { code } });
    if (row && row.phase === "LOBBY" && !row.playerIds.includes(userId)) {
      await ensureFree(userId, code);
      joinProfile = await profileOf(userId);
    }
  }
  const startItems =
    act.action === "start"
      ? async (st: QuizRaceSettings, seed: number) => pickQuestions(await quizCharacters(), { animeId: st.animeId, difficulty: st.difficulty, count: st.questions, seed })
      : null;
  let wantsRematch = false;

  let s = await withRoom(code, async (s, now) => {
    const me = s.players.find((p) => p.userId === userId);
    if (me && !me.left) me.lastSeenAt = now;
    switch (act.action) {
      case "sync":
        break;
      case "join":
        if (!me && s.phase === "LOBBY" && joinProfile) {
          if (s.players.length >= RACE_MAX_PLAYERS) throw new EngineError("ROOM_FULL", "QUIZ_ROOM_FULL");
          s.players.push(player(userId, joinProfile.username, joinProfile.avatar, null, now));
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
        if (s.phase !== "LOBBY") throw new EngineError("INVALID_STATE", "QUIZ_ALREADY_STARTED");
        if (s.hostId !== userId) throw new EngineError("FORBIDDEN", "QUIZ_HOST_ONLY");
        s.settings = cleanQuizSettings(act.settings, s.settings);
        break;
      case "start": {
        if (!me || me.left) throw new EngineError("NOT_A_PLAYER");
        if (s.phase !== "LOBBY") throw new EngineError("INVALID_STATE", "QUIZ_ALREADY_STARTED");
        if (s.hostId !== userId) throw new EngineError("FORBIDDEN", "QUIZ_HOST_ONLY");
        if (s.players.length < 2) throw new EngineError("INVALID_STATE", "QUIZ_NEED_PLAYERS");
        const items = await startItems!(s.settings, s.seed);
        if (items.length < s.settings.questions) throw new EngineError("INVALID_INPUT", "QUIZ_POOL_SMALL");
        begin(s, items, now);
        break;
      }
      case "answer": {
        if (!me || me.left) throw new EngineError("NOT_A_PLAYER");
        if (s.phase !== "PLAYING") throw new EngineError("INVALID_STATE", "QUIZ_QUESTION_OVER");
        const r = s.rounds[s.index];
        if (act.question !== s.index || r.closedAt !== null || now < r.startedAt!) throw new EngineError("INVALID_STATE", "QUIZ_QUESTION_OVER");
        if (r.answers[userId]) throw new EngineError("INVALID_STATE", "QUIZ_ALREADY_ANSWERED");
        if (!Number.isInteger(act.choice) || act.choice < 0 || act.choice > 3) throw new EngineError("INVALID_INPUT", "QUIZ_BAD_CHOICE");
        const real = optionOrder(s.seed, userId, s.index)[act.choice];
        const correct = real === s.items[s.index].correct;
        const first = correct && !Object.values(r.answers).some((a) => a.correct);
        const points = correct ? quizRacePoints({ secondsLeft: Math.max(0, (r.endsAt! - now) / 1000), first }) : 0;
        r.answers[userId] = { choice: real, at: now, correct, points };
        if (correct) {
          me.score += points;
          me.correct += 1;
        }
        break;
      }
      case "rematch":
        if (!me) throw new EngineError("NOT_A_PLAYER");
        if (s.phase !== "FINISHED" || s.mode !== "friendly") throw new EngineError("INVALID_STATE");
        if (!s.rematchCode) wantsRematch = true;
        break;
    }
  });

  if (wantsRematch) {
    const next = await createQuizRoom(userId, s.settings);
    s = await withRoom(code, (st) => {
      st.rematchCode ??= next;
    });
  }
  const change = s.phase === "FINISHED" && s.mode === "ranked" ? await ratingChangeFor(s) : null;
  return view(s, userId, Date.now(), change);
}

export async function viewQuizRace(rawCode: string, userId: string | null): Promise<QuizRaceView> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
  const row = await prisma.quizRoom.findUnique({ where: { code } });
  if (!row) throw new EngineError("NOT_FOUND", "QUIZ_ROOM_NOT_FOUND");
  const s = row.state as unknown as RaceState;
  advance(s, Date.now());
  return view(s, userId, Date.now(), s.phase === "FINISHED" && s.mode === "ranked" ? await ratingChangeFor(s) : null);
}

// ─── Results ──────────────────────────────────────────────────────────────

const REWARDS = {
  ranked: { win: 40, play: 15, winReason: "QUIZ_RANKED_WIN", playReason: "QUIZ_RANKED_PLAY" },
  friendly: { win: 25, play: 10, winReason: "QUIZ_RACE_WIN", playReason: "QUIZ_RACE_PLAY" },
} as const;

async function recordRace(s: RaceState): Promise<void> {
  if (!s.result) return;
  const played = s.rounds.some((r) => r.closedAt !== null);
  if (!played && !(s.mode === "ranked" && s.result.reason === "forfeit")) return;
  const rw = REWARDS[s.mode];
  const tiedTop = s.result.standings.filter((x) => x.place === 1).length;
  await recordGameResult({
    game: "QUIZ",
    mode: s.mode === "ranked" ? "ranked" : "race",
    ranked: s.mode === "ranked",
    refId: `room-${s.code}-${s.createdAt}`,
    startedAt: s.startedAt ? new Date(s.startedAt) : null,
    players: s.result.standings.map((st) => {
      const p = s.players.find((x) => x.userId === st.userId)!;
      const result = p.left ? "LOSS" : st.place === 1 ? (tiedTop > 1 && s.players.length === 2 ? "DRAW" : "WIN") : "LOSS";
      return { userId: st.userId, result, score: st.score, xp: p.left ? 0 : result === "WIN" ? rw.win : rw.play, reason: result === "WIN" ? rw.winReason : rw.playReason };
    }),
  });
}

async function ratingChangeFor(s: RaceState): Promise<Record<string, number> | null> {
  const m = await prisma.gameMatch.findUnique({ where: { game_refId: { game: "QUIZ", refId: `room-${s.code}-${s.createdAt}` } }, include: { players: true } });
  if (!m) return null;
  const out: Record<string, number> = {};
  for (const p of m.players) if (p.ratingAfter !== null && p.ratingBefore !== null) out[p.userId] = p.ratingAfter - p.ratingBefore;
  return out;
}

// ─── Ranked queue ─────────────────────────────────────────────────────────

export interface QuizQueueStatus {
  inQueue: boolean;
  since: number | null;
  matchedCode: string | null;
  rating: number;
}

async function createRankedRoom(tx: Tx, a: string, b: string, now: number): Promise<string> {
  const [pa, pb, ra, rb, chars] = await Promise.all([profileOf(a), profileOf(b), quizRating(a), quizRating(b), quizCharacters()]);
  const s: RaceState = {
    code: await uniqueCode(tx),
    mode: "ranked",
    phase: "LOBBY",
    hostId: a,
    settings: { difficulty: "MIXED", animeId: null, questions: RANKED_QUESTIONS },
    players: [player(a, pa.username, pa.avatar, ra, now), player(b, pb.username, pb.avatar, rb, now)],
    items: [],
    rounds: [],
    index: 0,
    createdAt: now,
    startedAt: null,
    result: null,
    recorded: false,
    rematchCode: null,
    seed: Math.floor(Math.random() * 2 ** 31),
  };
  begin(s, pickQuestions(chars, { animeId: null, difficulty: "MIXED", count: RANKED_QUESTIONS, seed: s.seed }), now);
  await save(tx, s);
  return s.code;
}

export async function quizQueuePoll(userId: string, join: boolean): Promise<QuizQueueStatus> {
  const rating = await quizRating(userId);
  const existing = await prisma.quizQueueEntry.findUnique({ where: { userId } });
  if (existing?.matchedCode) {
    await prisma.quizQueueEntry.deleteMany({ where: { userId } });
    return { inQueue: false, since: null, matchedCode: existing.matchedCode, rating };
  }
  if (!existing && !join) return { inQueue: false, since: null, matchedCode: null, rating };
  if (!existing) await ensureFree(userId);
  return exclusive(
    "quiz-queue",
    async (tx) => {
      const now = Date.now();
      const me = await tx.quizQueueEntry.upsert({
        where: { userId },
        create: { userId, rating, since: new Date(now), lastSeenAt: new Date(now) },
        update: { lastSeenAt: new Date(now), rating },
      });
      if (me.matchedCode) {
        await tx.quizQueueEntry.deleteMany({ where: { userId } });
        return { inQueue: false, since: null, matchedCode: me.matchedCode, rating };
      }
      const waiting = await tx.quizQueueEntry.findMany({
        where: { matchedCode: null, userId: { not: userId }, lastSeenAt: { gte: new Date(now - QUEUE_STALE_MS) } },
        orderBy: { since: "asc" },
      });
      const waitedS = (now - new Date(me.since).getTime()) / 1000;
      const window = Math.min(600, 100 + waitedS * 10);
      const other = waiting.find((w) => Math.abs(w.rating - rating) <= window);
      if (!other) return { inQueue: true, since: new Date(me.since).getTime(), matchedCode: null, rating };
      const code = await createRankedRoom(tx, other.userId, userId, now);
      await tx.quizQueueEntry.update({ where: { userId: other.userId }, data: { matchedCode: code } });
      await tx.quizQueueEntry.deleteMany({ where: { userId } });
      return { inQueue: false, since: null, matchedCode: code, rating };
    },
    (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(7314004)`,
  );
}

export async function quizQueueLeave(userId: string): Promise<void> {
  await prisma.quizQueueEntry.deleteMany({ where: { userId, matchedCode: null } });
}
