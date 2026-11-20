/**
 * Anime Quiz — rules shared by solo runs, the daily quiz and race rooms.
 *
 * Every question has four options. The order of the options is shuffled per
 * player and the correct one is only revealed after answering, so the answer
 * can't be read from the page or copied from another player.
 */

export type QuizDifficulty = "EASY" | "NORMAL" | "HARD" | "MIXED";
export type QuizCategory = "CHARACTERS" | "ABILITIES" | "STORY" | "WORLD";
/** Question level inside the bank: 1 = easy … 3 = hard. */
export type QuestionLevel = 1 | 2 | 3;

export const QUIZ_DIFFICULTIES: readonly QuizDifficulty[] = ["MIXED", "EASY", "NORMAL", "HARD"];
export const QUIZ_CATEGORIES: readonly QuizCategory[] = ["CHARACTERS", "ABILITIES", "STORY", "WORLD"];

/** Seconds to answer one question. */
export const QUESTION_SECONDS = 15;
/** Extra seconds from the time joker. */
export const TIME_JOKER_SECONDS = 10;
export const SOLO_QUESTIONS = 10;
export const DAILY_QUESTIONS = 10;
export const RACE_QUESTION_CHOICES = [5, 10, 15] as const;
export const RACE_MAX_PLAYERS = 8;

const LEVEL_FACTOR: Record<QuestionLevel, number> = { 1: 1, 2: 1.3, 3: 1.6 };

export function isQuizDifficulty(v: unknown): v is QuizDifficulty {
  return typeof v === "string" && (QUIZ_DIFFICULTIES as readonly string[]).includes(v);
}

/** Which question levels a difficulty draws from (in order of preference). */
export function levelsFor(d: QuizDifficulty): QuestionLevel[] {
  switch (d) {
    case "EASY":
      return [1];
    case "NORMAL":
      return [1, 2];
    case "HARD":
      return [2, 3];
    case "MIXED":
      return [1, 2, 3];
  }
}

/**
 * Solo/daily points for a correct answer: harder questions and faster answers
 * score more, and a run of correct answers adds a streak bonus.
 */
export function quizPoints(opts: { level: QuestionLevel; secondsLeft: number; limitSeconds?: number; streak: number }): number {
  const limit = opts.limitSeconds ?? QUESTION_SECONDS;
  const time = Math.round(50 * Math.max(0, Math.min(1, opts.secondsLeft / limit)));
  const streakBonus = Math.min(Math.max(0, opts.streak - 1), 5) * 10;
  return Math.round((100 + time) * LEVEL_FACTOR[opts.level]) + streakBonus;
}

/** Race points: speed matters most; the first correct answer gets a bonus. */
export function quizRacePoints(opts: { secondsLeft: number; first: boolean }): number {
  const speed = Math.round(100 * Math.max(0, Math.min(1, opts.secondsLeft / QUESTION_SECONDS)));
  return 100 + speed + (opts.first ? 20 : 0);
}

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Two wrong options to hide with the 50/50 joker (by position in the shown order). */
export function fiftyFiftyHide(correct: number, rand: () => number): number[] {
  const wrong = [0, 1, 2, 3].filter((i) => i !== correct);
  return shuffle(wrong, rand).slice(0, 2).sort((a, b) => a - b);
}
