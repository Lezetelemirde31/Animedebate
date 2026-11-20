/**
 * Anime Quiz — solo runs and the daily quiz.
 *
 * A run is one database row (QuizRun) locked for every request. The
 * questions with their answers live in the row; a player only ever receives
 * the current question, and the correct option only after answering.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dayKey as todayKey, previousDayKey } from "@/game/guess/rules";
import {
  DAILY_QUESTIONS,
  QUESTION_SECONDS,
  SOLO_QUESTIONS,
  TIME_JOKER_SECONDS,
  fiftyFiftyHide,
  hashString,
  quizPoints,
  seededRandom,
  type QuizDifficulty,
} from "@/game/quiz/rules";
import { EngineError } from "../live/room";
import { recordGameResult } from "../platform/results";
import { exclusive } from "../guess/shared";
import { pickQuestions, type QuizItem } from "./questions";
import { quizCharacters } from "./shared";

export type QuizRunKind = "solo" | "daily";
type Result = "correct" | "wrong" | "timeout" | "skipped";

interface Slot {
  startedAt: number | null;
  endsAt: number | null;
  choice: number | null;
  result: Result | null;
  points: number;
  hidden: number[];
}

interface QuizState {
  items: QuizItem[];
  slots: Slot[];
  index: number;
  streak: number;
  bestStreak: number;
  jokers: { fifty: boolean; time: boolean };
  recorded: boolean;
}

interface RunRow {
  id: string;
  userId: string;
  kind: string;
  dayKey: string | null;
  difficulty: string;
  animeId: string | null;
  state: unknown;
  score: number;
  correct: number;
  questions: number;
  finished: boolean;
  createdAt: Date;
}

const SOLO_DAILY_REWARDS = 10;

// ─── View ─────────────────────────────────────────────────────────────────

export interface QuizQuestionView {
  number: number;
  animeId: string;
  level: number;
  category: string;
  q: { tr: string; en: string };
  options: { tr: string[]; en: string[] };
  startedAt: number | null;
  endsAt: number | null;
  /** Options removed by the 50/50 joker. */
  hidden: number[];
  choice: number | null;
  result: Result | null;
  points: number;
  /** Only once answered (or timed out). */
  correct: number | null;
}

export interface QuizRunView {
  id: string;
  kind: QuizRunKind;
  difficulty: QuizDifficulty;
  animeId: string | null;
  dayKey: string | null;
  total: number;
  index: number;
  score: number;
  correct: number;
  streak: number;
  bestStreak: number;
  jokers: { fifty: boolean; time: boolean };
  finished: boolean;
  serverNow: number;
  question: QuizQuestionView;
  history: { number: number; result: Result; points: number; q: { tr: string; en: string }; answer: { tr: string; en: string } }[];
}

function view(row: RunRow, s: QuizState, now: number): QuizRunView {
  const item = s.items[s.index];
  const slot = s.slots[s.index];
  const over = slot.result !== null;
  return {
    id: row.id,
    kind: row.kind as QuizRunKind,
    difficulty: row.difficulty as QuizDifficulty,
    animeId: row.animeId,
    dayKey: row.dayKey,
    total: s.items.length,
    index: s.index,
    score: row.score,
    correct: row.correct,
    streak: s.streak,
    bestStreak: s.bestStreak,
    jokers: s.jokers,
    finished: row.finished,
    serverNow: now,
    question: {
      number: s.index + 1,
      animeId: item.animeId,
      level: item.level,
      category: item.category,
      q: { tr: item.tr.q, en: item.en.q },
      options: { tr: item.tr.options, en: item.en.options },
      startedAt: slot.startedAt,
      endsAt: slot.endsAt,
      hidden: slot.hidden,
      choice: slot.choice,
      result: slot.result,
      points: slot.points,
      correct: over ? item.correct : null,
    },
    history: s.slots
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => x.result !== null)
      .map(({ x, i }) => ({
        number: i + 1,
        result: x.result!,
        points: x.points,
        q: { tr: s.items[i].tr.q, en: s.items[i].en.q },
        answer: { tr: s.items[i].tr.options[s.items[i].correct], en: s.items[i].en.options[s.items[i].correct] },
      })),
  };
}

// ─── Flow ─────────────────────────────────────────────────────────────────

function start(s: QuizState, now: number): void {
  const slot = s.slots[s.index];
  slot.startedAt = now;
  slot.endsAt = now + QUESTION_SECONDS * 1000;
}

function catchUp(s: QuizState, now: number): void {
  const slot = s.slots[s.index];
  if (slot.result === null && slot.endsAt !== null && now >= slot.endsAt) {
    slot.result = "timeout";
    s.streak = 0;
  }
}

function newState(items: QuizItem[]): QuizState {
  return {
    items,
    slots: items.map(() => ({ startedAt: null, endsAt: null, choice: null, result: null, points: 0, hidden: [] })),
    index: 0,
    streak: 0,
    bestStreak: 0,
    jokers: { fifty: false, time: false },
    recorded: false,
  };
}

const totals = (s: QuizState) => ({
  score: s.slots.reduce((n, x) => n + x.points, 0),
  correct: s.slots.filter((x) => x.result === "correct").length,
});

// ─── Public API ───────────────────────────────────────────────────────────

export async function startQuizRun(userId: string, opts: { difficulty: QuizDifficulty; animeId: string | null }): Promise<string> {
  const chars = await quizCharacters();
  const seed = Math.floor(Math.random() * 2 ** 31);
  const items = pickQuestions(chars, { animeId: opts.animeId, difficulty: opts.difficulty, count: SOLO_QUESTIONS, seed });
  if (items.length < 5) throw new EngineError("INVALID_INPUT", "QUIZ_POOL_SMALL");
  const s = newState(items);
  start(s, Date.now());
  await prisma.quizRun.updateMany({ where: { userId, kind: "solo", finished: false }, data: { finished: true } });
  const row = await prisma.quizRun.create({
    data: { userId, kind: "solo", dayKey: null, difficulty: opts.difficulty, animeId: opts.animeId, questions: items.length, state: s as unknown as Prisma.InputJsonValue },
  });
  return row.id;
}

/** The daily quiz: the same questions (in the same order) for everyone on a day. */
export async function dailyItems(key: string): Promise<QuizItem[]> {
  return pickQuestions(await quizCharacters(), { animeId: null, difficulty: "MIXED", count: DAILY_QUESTIONS, seed: hashString(`quiz-daily:${key}`) });
}

export async function startDailyQuiz(userId: string, now = Date.now()): Promise<string> {
  const key = todayKey(now);
  const existing = await prisma.quizRun.findUnique({ where: { userId_dayKey: { userId, dayKey: key } } });
  if (existing) return existing.id;
  const s = newState(await dailyItems(key));
  start(s, now);
  try {
    const row = await prisma.quizRun.create({
      data: { userId, kind: "daily", dayKey: key, difficulty: "MIXED", animeId: null, questions: s.items.length, state: s as unknown as Prisma.InputJsonValue },
    });
    return row.id;
  } catch {
    const again = await prisma.quizRun.findUnique({ where: { userId_dayKey: { userId, dayKey: key } } });
    if (again) return again.id;
    throw new EngineError("SERVER_ERROR");
  }
}

export type QuizRunAction =
  | { action: "sync" }
  | { action: "answer"; choice: number; question: number }
  | { action: "joker"; kind: "fifty" | "time" }
  | { action: "next" }
  | { action: "quit" };

export async function quizRunRequest(id: string, userId: string, act: QuizRunAction): Promise<QuizRunView> {
  if (typeof id !== "string" || id.length > 40) throw new EngineError("INVALID_INPUT");
  let toRecord: { row: RunRow; s: QuizState } | null = null;

  const out = await exclusive(
    `quiz-run:${id}`,
    async (tx) => {
      const row = (await tx.quizRun.findUnique({ where: { id } })) as RunRow | null;
      if (!row || row.userId !== userId) throw new EngineError("NOT_FOUND", "QUIZ_RUN_NOT_FOUND");
      const s = row.state as QuizState;
      const now = Date.now();
      const wasFinished = row.finished;
      if (!row.finished) catchUp(s, now);
      const slot = s.slots[s.index];
      const item = s.items[s.index];

      switch (act.action) {
        case "sync":
          break;
        case "answer": {
          if (row.finished || slot.result !== null || act.question !== s.index) throw new EngineError("INVALID_STATE", "QUIZ_QUESTION_OVER");
          if (!Number.isInteger(act.choice) || act.choice < 0 || act.choice > 3 || slot.hidden.includes(act.choice)) throw new EngineError("INVALID_INPUT", "QUIZ_BAD_CHOICE");
          slot.choice = act.choice;
          if (act.choice === item.correct) {
            s.streak += 1;
            s.bestStreak = Math.max(s.bestStreak, s.streak);
            slot.result = "correct";
            const limit = (slot.endsAt! - slot.startedAt!) / 1000;
            slot.points = quizPoints({ level: item.level, secondsLeft: Math.max(0, (slot.endsAt! - now) / 1000), limitSeconds: limit, streak: s.streak });
          } else {
            slot.result = "wrong";
            s.streak = 0;
          }
          break;
        }
        case "joker": {
          if (row.finished || slot.result !== null) throw new EngineError("INVALID_STATE", "QUIZ_QUESTION_OVER");
          if (act.kind === "fifty") {
            if (s.jokers.fifty) throw new EngineError("INVALID_STATE", "QUIZ_JOKER_USED");
            s.jokers.fifty = true;
            slot.hidden = fiftyFiftyHide(item.correct, seededRandom(hashString(`${row.id}:${s.index}`)));
          } else if (act.kind === "time") {
            if (s.jokers.time) throw new EngineError("INVALID_STATE", "QUIZ_JOKER_USED");
            s.jokers.time = true;
            slot.endsAt = slot.endsAt! + TIME_JOKER_SECONDS * 1000;
          } else {
            throw new EngineError("INVALID_INPUT");
          }
          break;
        }
        case "next":
          if (row.finished) break;
          if (slot.result === null) throw new EngineError("INVALID_STATE", "QUIZ_QUESTION_RUNNING");
          if (s.index < s.items.length - 1) {
            s.index += 1;
            start(s, now);
          }
          break;
        case "quit":
          if (row.finished) break;
          for (const x of s.slots.slice(s.index)) if (x.result === null) x.result = "skipped";
          s.index = s.items.length - 1;
          break;
      }

      const last = s.slots[s.slots.length - 1];
      const finished = row.finished || (s.index === s.items.length - 1 && last.result !== null);
      const t = totals(s);
      if (finished && !wasFinished && !s.recorded) {
        s.recorded = true;
        toRecord = { row: { ...row, score: t.score, correct: t.correct, finished: true }, s: structuredClone(s) };
      }
      const updated = (await tx.quizRun.update({
        where: { id },
        data: { state: s as unknown as Prisma.InputJsonValue, score: t.score, correct: t.correct, finished },
      })) as RunRow;
      return view(updated, s, now);
    },
    (tx) => tx.$queryRaw`SELECT "id" FROM "QuizRun" WHERE "id" = ${id} FOR UPDATE`,
  );

  if (toRecord) await recordRun(toRecord).catch((err) => console.error("[quiz] record failed", err));
  return out;
}

// ─── Results ──────────────────────────────────────────────────────────────

async function recordRun({ row, s }: { row: RunRow; s: QuizState }): Promise<void> {
  const answered = s.slots.filter((x) => x.result === "correct" || x.result === "wrong" || x.result === "timeout").length;
  const correct = row.correct;
  let xp = 0;
  let reason = "QUIZ_SOLO";
  if (row.kind === "daily") {
    reason = "QUIZ_DAILY";
    xp = answered > 0 ? Math.min(35, 15 + correct * 2) : 0;
  } else if (answered > 0) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const today = await prisma.gameMatchPlayer.count({ where: { userId: row.userId, endedAt: { gte: since }, match: { game: "QUIZ", mode: "solo" } } });
    xp = today < SOLO_DAILY_REWARDS ? Math.min(25, Math.round(row.score / 60)) : 0;
  }
  if (answered > 0) {
    await recordGameResult({
      game: "QUIZ",
      mode: row.kind,
      ranked: false,
      refId: `run-${row.id}`,
      startedAt: row.createdAt,
      players: [{ userId: row.userId, result: correct * 2 >= s.items.length ? "WIN" : "LOSS", score: row.score, xp, reason }],
    });
  }

  const stats = await prisma.quizStats.findUnique({ where: { userId: row.userId } });
  const daily = row.kind === "daily" && row.dayKey;
  let dailyStreak = stats?.dailyStreak ?? 0;
  if (daily) dailyStreak = stats?.lastDailyKey === previousDayKey(row.dayKey!) ? dailyStreak + 1 : stats?.lastDailyKey === row.dayKey ? dailyStreak : 1;
  const data = {
    runs: (stats?.runs ?? 0) + 1,
    answered: (stats?.answered ?? 0) + answered,
    correct: (stats?.correct ?? 0) + correct,
    bestScore: row.kind === "solo" ? Math.max(stats?.bestScore ?? 0, row.score) : (stats?.bestScore ?? 0),
    bestStreak: Math.max(stats?.bestStreak ?? 0, s.bestStreak),
    dailyPlayed: (stats?.dailyPlayed ?? 0) + (daily ? 1 : 0),
    dailyStreak,
    bestDailyStreak: Math.max(stats?.bestDailyStreak ?? 0, dailyStreak),
    lastDailyKey: daily ? row.dayKey : (stats?.lastDailyKey ?? null),
  };
  await prisma.quizStats.upsert({ where: { userId: row.userId }, create: { userId: row.userId, ...data }, update: data });
}

// ─── Reads for pages ──────────────────────────────────────────────────────

export async function getQuizStats(userId: string, now = Date.now()) {
  const s = await prisma.quizStats.findUnique({ where: { userId } });
  const today = todayKey(now);
  const alive = s?.lastDailyKey === today || s?.lastDailyKey === previousDayKey(today);
  return {
    runs: s?.runs ?? 0,
    answered: s?.answered ?? 0,
    correct: s?.correct ?? 0,
    bestScore: s?.bestScore ?? 0,
    bestStreak: s?.bestStreak ?? 0,
    dailyPlayed: s?.dailyPlayed ?? 0,
    dailyStreak: alive ? (s?.dailyStreak ?? 0) : 0,
    bestDailyStreak: s?.bestDailyStreak ?? 0,
  };
}

export async function getTodayQuiz(userId: string, now = Date.now()) {
  return prisma.quizRun.findUnique({
    where: { userId_dayKey: { userId, dayKey: todayKey(now) } },
    select: { id: true, finished: true, score: true, correct: true, questions: true },
  });
}

export async function getQuizDailyBoard(limit = 10, now = Date.now()) {
  const rows = await prisma.quizRun.findMany({
    where: { kind: "daily", dayKey: todayKey(now), finished: true },
    orderBy: [{ score: "desc" }, { correct: "desc" }, { updatedAt: "asc" }],
    take: limit,
    include: { user: { select: { username: true, avatarStyle: true, avatarCustomUrl: true, avatarCharacter: { select: { imageUrl: true } } } } },
  });
  return rows.map((r) => ({
    userId: r.userId,
    username: r.user.username,
    avatarStyle: r.user.avatarStyle,
    avatarImage: r.user.avatarCustomUrl ?? r.user.avatarCharacter?.imageUrl ?? null,
    score: r.score,
    correct: r.correct,
    questions: r.questions,
  }));
}

export async function getOpenQuizRun(userId: string): Promise<string | null> {
  const row = await prisma.quizRun.findFirst({ where: { userId, kind: "solo", finished: false }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return row?.id ?? null;
}
