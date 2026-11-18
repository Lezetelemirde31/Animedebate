/**
 * "Who Is This Character?" — solo runs and the daily challenge.
 *
 * A run lives in one database row (GuessRun) that is locked for every
 * request. The character of the current round never leaves the server until
 * the round is over; the picture is served by the image route, which only
 * hands out stages the player has already reached.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DAILY_ROUNDS,
  LAST_STAGE,
  ROUND_SECONDS,
  SOLO_ROUNDS,
  dailySet,
  dayKey as todayKey,
  hintsFor,
  modesFor,
  pickCharacters,
  poolFor,
  previousDayKey,
  roundPoints,
  type Difficulty,
  type GuessMode,
  type RunMode,
} from "@/game/guess/rules";
import { EngineError } from "../live/room";
import { recordGameResult } from "../platform/results";
import { answerOf, exclusive, guessCharacters, type GuessAnswer, type GuessCharacter } from "./shared";

export type RunKind = "solo" | "daily";
type RoundResult = "correct" | "wrong" | "timeout" | "skipped";

interface SoloRound {
  c: string;
  m: GuessMode;
  stage: number;
  guesses: string[];
  startedAt: number | null;
  endsAt: number | null;
  result: RoundResult | null;
  points: number;
}

interface SoloState {
  rounds: SoloRound[];
  index: number;
  streak: number;
  bestStreak: number;
  recorded: boolean;
}

interface RunRow {
  id: string;
  userId: string;
  kind: string;
  dayKey: string | null;
  mode: string;
  difficulty: string;
  animeId: string | null;
  state: unknown;
  score: number;
  correct: number;
  rounds: number;
  finished: boolean;
  createdAt: Date;
}

/** Rewarded solo runs per day (the daily challenge is always rewarded). */
const SOLO_DAILY_REWARDS = 10;

// ─── View ─────────────────────────────────────────────────────────────────

export interface RunRoundView {
  number: number;
  mode: GuessMode;
  stage: number;
  startedAt: number | null;
  endsAt: number | null;
  result: RoundResult | null;
  points: number;
  guesses: { id: string; name: string }[];
  hints: { animeId: string | null; initials: string | null };
  image: string;
  answer: GuessAnswer | null;
}

export interface RunView {
  id: string;
  kind: RunKind;
  mode: RunMode;
  difficulty: Difficulty;
  animeId: string | null;
  dayKey: string | null;
  total: number;
  index: number;
  score: number;
  correct: number;
  streak: number;
  bestStreak: number;
  finished: boolean;
  serverNow: number;
  round: RunRoundView;
  history: { number: number; mode: GuessMode; result: RoundResult; points: number; answer: GuessAnswer | null }[];
}

function view(row: RunRow, s: SoloState, byId: Map<string, GuessCharacter>, now: number): RunView {
  const r = s.rounds[s.index];
  const c = byId.get(r.c);
  const over = r.result !== null;
  return {
    id: row.id,
    kind: row.kind as RunKind,
    mode: row.mode as RunMode,
    difficulty: row.difficulty as Difficulty,
    animeId: row.animeId,
    dayKey: row.dayKey,
    total: s.rounds.length,
    index: s.index,
    score: row.score,
    correct: row.correct,
    streak: s.streak,
    bestStreak: s.bestStreak,
    finished: row.finished,
    serverNow: now,
    round: {
      number: s.index + 1,
      mode: r.m,
      stage: over ? LAST_STAGE : r.stage,
      startedAt: r.startedAt,
      endsAt: r.endsAt,
      result: r.result,
      points: r.points,
      guesses: r.guesses.map((id) => ({ id, name: byId.get(id)?.name ?? "?" })),
      hints: c ? hintsFor(over ? LAST_STAGE : r.stage, c) : { animeId: null, initials: null },
      image: `/api/guess/runs/${row.id}/image?r=${s.index}&s=${over ? LAST_STAGE : r.stage}`,
      answer: over ? answerOf(c) : null,
    },
    history: s.rounds
      .slice(0, s.index + (over ? 1 : 0))
      .filter((x) => x.result !== null)
      .map((x, i) => ({ number: i + 1, mode: x.m, result: x.result!, points: x.points, answer: answerOf(byId.get(x.c)) })),
  };
}

// ─── Flow ─────────────────────────────────────────────────────────────────

function startRound(s: SoloState, now: number): void {
  const r = s.rounds[s.index];
  r.startedAt = now;
  r.endsAt = now + ROUND_SECONDS * 1000;
}

/** Applies a timeout if the current round's time has run out. */
function catchUp(s: SoloState, now: number): void {
  const r = s.rounds[s.index];
  if (r.result === null && r.endsAt !== null && now >= r.endsAt) {
    r.result = "timeout";
    s.streak = 0;
  }
}

function totals(s: SoloState): { score: number; correct: number } {
  return {
    score: s.rounds.reduce((n, r) => n + r.points, 0),
    correct: s.rounds.filter((r) => r.result === "correct").length,
  };
}

function isLastRound(s: SoloState): boolean {
  return s.index === s.rounds.length - 1;
}

function newState(chars: GuessCharacter[], modes: GuessMode[]): SoloState {
  return {
    rounds: chars.map((c, i) => ({ c: c.id, m: modes[i], stage: 0, guesses: [], startedAt: null, endsAt: null, result: null, points: 0 })),
    index: 0,
    streak: 0,
    bestStreak: 0,
    recorded: false,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function startSoloRun(userId: string, opts: { mode: RunMode; difficulty: Difficulty; animeId: string | null }): Promise<string> {
  const { list } = await guessCharacters();
  const pool = poolFor(list, { difficulty: opts.difficulty, animeId: opts.animeId });
  if (pool.length < 4) throw new EngineError("INVALID_INPUT", "GUESS_POOL_SMALL");
  const seed = Math.floor(Math.random() * 2 ** 31);
  const chars = pickCharacters(pool, SOLO_ROUNDS, seed);
  const s = newState(chars, modesFor(opts.mode, chars.length, seed));
  startRound(s, Date.now());
  // An unfinished solo run is abandoned when a new one starts.
  await prisma.guessRun.updateMany({ where: { userId, kind: "solo", finished: false }, data: { finished: true } });
  const row = await prisma.guessRun.create({
    data: {
      userId,
      kind: "solo",
      dayKey: null,
      mode: opts.mode,
      difficulty: opts.difficulty,
      animeId: opts.animeId,
      rounds: chars.length,
      state: s as unknown as Prisma.InputJsonValue,
    },
  });
  return row.id;
}

/** Today's challenge for this player: the existing run if they already started it. */
export async function startDailyRun(userId: string, now = Date.now()): Promise<string> {
  const key = todayKey(now);
  const existing = await prisma.guessRun.findUnique({ where: { userId_dayKey: { userId, dayKey: key } } });
  if (existing) return existing.id;
  const { list } = await guessCharacters();
  const set = dailySet(list, key);
  if (set.characters.length < DAILY_ROUNDS) throw new EngineError("INVALID_INPUT", "GUESS_POOL_SMALL");
  const s = newState(set.characters, set.modes);
  startRound(s, now);
  try {
    const row = await prisma.guessRun.create({
      data: { userId, kind: "daily", dayKey: key, mode: "MIXED", difficulty: "NORMAL", animeId: null, rounds: DAILY_ROUNDS, state: s as unknown as Prisma.InputJsonValue },
    });
    return row.id;
  } catch {
    // Started at the same moment from another tab.
    const again = await prisma.guessRun.findUnique({ where: { userId_dayKey: { userId, dayKey: key } } });
    if (again) return again.id;
    throw new EngineError("SERVER_ERROR");
  }
}

export type RunAction = { action: "sync" } | { action: "guess"; characterId: string } | { action: "hint" } | { action: "next" } | { action: "quit" };

export async function runRequest(id: string, userId: string, act: RunAction): Promise<RunView> {
  if (typeof id !== "string" || id.length > 40) throw new EngineError("INVALID_INPUT");
  const { byId } = await guessCharacters();
  let toRecord: { row: RunRow; s: SoloState } | null = null;

  const result = await exclusive(
    `guess-run:${id}`,
    async (tx) => {
      const row = (await tx.guessRun.findUnique({ where: { id } })) as RunRow | null;
      if (!row || row.userId !== userId) throw new EngineError("NOT_FOUND", "GUESS_RUN_NOT_FOUND");
      const s = row.state as SoloState;
      const now = Date.now();
      const wasFinished = row.finished;
      if (!row.finished) catchUp(s, now);
      const r = s.rounds[s.index];

      switch (act.action) {
        case "sync":
          break;
        case "guess": {
          if (row.finished || r.result !== null) throw new EngineError("INVALID_STATE", "GUESS_ROUND_OVER");
          if (typeof act.characterId !== "string" || !byId.has(act.characterId)) throw new EngineError("INVALID_INPUT", "GUESS_BAD_CHARACTER");
          if (r.guesses.includes(act.characterId)) throw new EngineError("INVALID_STATE", "GUESS_ALREADY_TRIED");
          if (act.characterId === r.c) {
            s.streak += 1;
            s.bestStreak = Math.max(s.bestStreak, s.streak);
            r.result = "correct";
            r.points = roundPoints({ stage: r.stage, secondsLeft: Math.max(0, (r.endsAt! - now) / 1000), difficulty: row.difficulty as Difficulty, streak: s.streak });
          } else {
            r.guesses.push(act.characterId);
            if (r.stage >= LAST_STAGE) {
              r.result = "wrong";
              s.streak = 0;
            } else {
              r.stage += 1;
            }
          }
          break;
        }
        case "hint":
          if (row.finished || r.result !== null) throw new EngineError("INVALID_STATE", "GUESS_ROUND_OVER");
          if (r.stage >= LAST_STAGE) throw new EngineError("INVALID_STATE", "GUESS_NO_HINT");
          r.stage += 1;
          break;
        case "next":
          if (row.finished) break;
          if (r.result === null) throw new EngineError("INVALID_STATE", "GUESS_ROUND_RUNNING");
          if (!isLastRound(s)) {
            s.index += 1;
            startRound(s, now);
          }
          break;
        case "quit":
          if (row.finished) break;
          for (const x of s.rounds.slice(s.index)) if (x.result === null) x.result = "skipped";
          s.index = s.rounds.length - 1;
          break;
      }

      // The run ends when its last round is decided.
      const last = s.rounds[s.rounds.length - 1];
      const finished = row.finished || (isLastRound(s) && last.result !== null);
      const t = totals(s);
      if (finished && !wasFinished && !s.recorded) {
        s.recorded = true;
        toRecord = { row: { ...row, score: t.score, correct: t.correct, finished: true }, s: structuredClone(s) };
      }
      const updated = (await tx.guessRun.update({
        where: { id },
        data: { state: s as unknown as Prisma.InputJsonValue, score: t.score, correct: t.correct, finished },
      })) as RunRow;
      return view(updated, s, byId, now);
    },
    (tx) => tx.$queryRaw`SELECT "id" FROM "GuessRun" WHERE "id" = ${id} FOR UPDATE`,
  );

  if (toRecord) await recordRun(toRecord).catch((err) => console.error("[guess] record failed", err));
  return result;
}

/** What the image route may show: the character and style of round `r` at stage `s`. */
export async function runImageTarget(id: string, userId: string, r: number, stage: number) {
  const row = (await prisma.guessRun.findUnique({ where: { id } })) as RunRow | null;
  if (!row || row.userId !== userId) throw new EngineError("NOT_FOUND", "GUESS_RUN_NOT_FOUND");
  const s = row.state as SoloState;
  const round = s.rounds[r];
  if (!round || r > s.index || !Number.isInteger(stage) || stage < 0 || stage > LAST_STAGE) throw new EngineError("INVALID_INPUT");
  if (round.startedAt === null) throw new EngineError("FORBIDDEN", "FORBIDDEN");
  // While a round is being played only the stages already reached are available.
  if (round.result === null && !row.finished && stage > round.stage) throw new EngineError("FORBIDDEN", "FORBIDDEN");
  const { byId } = await guessCharacters();
  const c = byId.get(round.c);
  if (!c?.imageUrl) throw new EngineError("NOT_FOUND", "NOT_FOUND");
  return { imageUrl: c.imageUrl, mode: round.m, difficulty: row.difficulty as Difficulty };
}

// ─── Results ──────────────────────────────────────────────────────────────

async function recordRun({ row, s }: { row: RunRow; s: SoloState }): Promise<void> {
  const played = s.rounds.filter((r) => r.result !== null && r.result !== "skipped").length;
  const correct = row.correct;
  let xp = 0;
  let reason = "GUESS_SOLO";
  if (row.kind === "daily") {
    reason = "GUESS_DAILY";
    xp = played > 0 ? Math.min(30, 15 + correct * 3) : 0;
  } else if (played > 0) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const today = await prisma.gameMatchPlayer.count({ where: { userId: row.userId, endedAt: { gte: since }, match: { game: "GUESS", mode: "solo" } } });
    xp = today < SOLO_DAILY_REWARDS ? Math.min(25, Math.round(row.score / 40)) : 0;
  }
  if (played > 0) {
    await recordGameResult({
      game: "GUESS",
      mode: row.kind,
      ranked: false,
      refId: `run-${row.id}`,
      startedAt: row.createdAt,
      players: [{ userId: row.userId, result: correct * 2 >= s.rounds.length ? "WIN" : "LOSS", score: row.score, xp, reason }],
    });
  }

  const stats = await prisma.guessStats.findUnique({ where: { userId: row.userId } });
  const daily = row.kind === "daily" && row.dayKey;
  let dailyStreak = stats?.dailyStreak ?? 0;
  if (daily) dailyStreak = stats?.lastDailyKey === previousDayKey(row.dayKey!) ? dailyStreak + 1 : stats?.lastDailyKey === row.dayKey ? dailyStreak : 1;
  const data = {
    runs: (stats?.runs ?? 0) + 1,
    roundsPlayed: (stats?.roundsPlayed ?? 0) + played,
    roundsCorrect: (stats?.roundsCorrect ?? 0) + correct,
    bestScore: row.kind === "solo" ? Math.max(stats?.bestScore ?? 0, row.score) : (stats?.bestScore ?? 0),
    bestStreak: Math.max(stats?.bestStreak ?? 0, s.bestStreak),
    dailyPlayed: (stats?.dailyPlayed ?? 0) + (daily ? 1 : 0),
    dailyStreak,
    bestDailyStreak: Math.max(stats?.bestDailyStreak ?? 0, dailyStreak),
    lastDailyKey: daily ? row.dayKey : (stats?.lastDailyKey ?? null),
  };
  await prisma.guessStats.upsert({ where: { userId: row.userId }, create: { userId: row.userId, ...data }, update: data });
}

// ─── Reads for pages ──────────────────────────────────────────────────────

export interface GuessStatsView {
  runs: number;
  roundsPlayed: number;
  roundsCorrect: number;
  bestScore: number;
  bestStreak: number;
  dailyPlayed: number;
  /** Current daily streak (0 once a day was missed). */
  dailyStreak: number;
  bestDailyStreak: number;
}

export async function getGuessStats(userId: string, now = Date.now()): Promise<GuessStatsView> {
  const s = await prisma.guessStats.findUnique({ where: { userId } });
  const today = todayKey(now);
  const alive = s?.lastDailyKey === today || s?.lastDailyKey === previousDayKey(today);
  return {
    runs: s?.runs ?? 0,
    roundsPlayed: s?.roundsPlayed ?? 0,
    roundsCorrect: s?.roundsCorrect ?? 0,
    bestScore: s?.bestScore ?? 0,
    bestStreak: s?.bestStreak ?? 0,
    dailyPlayed: s?.dailyPlayed ?? 0,
    dailyStreak: alive ? (s?.dailyStreak ?? 0) : 0,
    bestDailyStreak: s?.bestDailyStreak ?? 0,
  };
}

/** This player's run of today's challenge, if started. */
export async function getTodayRun(userId: string, now = Date.now()) {
  return prisma.guessRun.findUnique({
    where: { userId_dayKey: { userId, dayKey: todayKey(now) } },
    select: { id: true, finished: true, score: true, correct: true, rounds: true },
  });
}

/** Today's best daily-challenge results. */
export async function getDailyBoard(limit = 10, now = Date.now()) {
  const rows = await prisma.guessRun.findMany({
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
    rounds: r.rounds,
  }));
}

/** The player's unfinished solo run, if any. */
export async function getOpenSoloRun(userId: string): Promise<string | null> {
  const row = await prisma.guessRun.findFirst({ where: { userId, kind: "solo", finished: false }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return row?.id ?? null;
}
