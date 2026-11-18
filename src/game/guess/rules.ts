/**
 * "Who Is This Character?" — pure game rules shared by the solo runs, the
 * daily challenge and the race rooms.
 *
 * A round shows a disguised picture of a character. The picture has four
 * stages (0 = hardest … 3 = clearest); every hint or wrong guess moves it to
 * the next stage, and a wrong guess on the last stage loses the round.
 * Pictures are produced on the server, so neither the image address nor the
 * network traffic reveals who it is.
 */

export type GuessMode = "BLUR" | "PIXEL" | "SHADOW" | "EYES";
export type RunMode = GuessMode | "MIXED";
export type Difficulty = "EASY" | "NORMAL" | "HARD";

export const GUESS_MODES: readonly GuessMode[] = ["BLUR", "PIXEL", "SHADOW", "EYES"];
export const RUN_MODES: readonly RunMode[] = ["MIXED", ...GUESS_MODES];
export const DIFFICULTIES: readonly Difficulty[] = ["EASY", "NORMAL", "HARD"];

export const STAGES = 4;
export const LAST_STAGE = STAGES - 1;
/** Seconds to answer one round. */
export const ROUND_SECONDS = 30;
export const SOLO_ROUNDS = 10;
export const DAILY_ROUNDS = 5;
/** Race rooms: a stage is revealed for everyone every few seconds. */
export const RACE_STAGE_SECONDS = 7;
export const RACE_WRONG_LIMIT = 3;
export const RACE_ROUND_CHOICES = [5, 8, 10] as const;
export const RACE_MAX_PLAYERS = 8;

const STAGE_POINTS = [100, 70, 45, 25];
const DIFFICULTY_FACTOR: Record<Difficulty, number> = { EASY: 1, NORMAL: 1.2, HARD: 1.5 };
/** Race bonus for the first, second and third correct answer. */
const ORDER_BONUS = [30, 15, 5];

export function isGuessMode(v: unknown): v is GuessMode {
  return typeof v === "string" && (GUESS_MODES as readonly string[]).includes(v);
}
export function isRunMode(v: unknown): v is RunMode {
  return typeof v === "string" && (RUN_MODES as readonly string[]).includes(v);
}
export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);
}

/**
 * Picture strength for a stage: HARD starts one level more disguised.
 * Level 0 is the strongest disguise, 4 the lightest.
 */
export function effectLevel(stage: number, difficulty: Difficulty): number {
  const s = Math.max(0, Math.min(LAST_STAGE, stage));
  return difficulty === "HARD" ? s : s + 1;
}

/**
 * Solo/daily points for a correct answer: fewer stages used and a faster
 * answer score more; harder settings multiply; a run of correct answers adds
 * a streak bonus.
 */
export function roundPoints(opts: { stage: number; secondsLeft: number; difficulty: Difficulty; streak: number }): number {
  const base = STAGE_POINTS[Math.max(0, Math.min(LAST_STAGE, opts.stage))];
  const time = Math.round(20 * Math.max(0, Math.min(1, opts.secondsLeft / ROUND_SECONDS)));
  const streakBonus = Math.min(Math.max(0, opts.streak - 1), 5) * 5;
  return Math.round((base + time) * DIFFICULTY_FACTOR[opts.difficulty]) + streakBonus;
}

/** Race points: the stage everyone was on, plus a bonus for answering first. */
export function racePoints(stage: number, order: number): number {
  return STAGE_POINTS[Math.max(0, Math.min(LAST_STAGE, stage))] + (ORDER_BONUS[order] ?? 0);
}

/** Stage of a race round after `elapsedMs` (everyone sees the same picture). */
export function raceStage(elapsedMs: number): number {
  return Math.max(0, Math.min(LAST_STAGE, Math.floor(elapsedMs / (RACE_STAGE_SECONDS * 1000))));
}

// ─── Picking characters ───────────────────────────────────────────────────

export interface PoolCharacter {
  id: string;
  animeId: string;
  rarity: string;
  imageUrl: string | null;
}

/** Well-known characters: main casts and major villains are Epic or above. */
const FAMOUS = new Set(["EPIC", "LEGENDARY", "MYTHIC"]);

export function poolFor<T extends PoolCharacter>(all: T[], opts: { difficulty: Difficulty; animeId?: string | null }): T[] {
  return all.filter((c) => !!c.imageUrl && (!opts.animeId || c.animeId === opts.animeId) && (opts.difficulty !== "EASY" || FAMOUS.has(c.rarity)));
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

/** `n` different characters (fewer if the pool is smaller), in a seeded order. */
export function pickCharacters<T extends { id: string }>(pool: T[], n: number, seed: number): T[] {
  const rand = seededRandom(seed);
  const list = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, n);
}

/** The picture style of each round: a fixed mode, or a seeded mix where consecutive rounds differ. */
export function modesFor(mode: RunMode, n: number, seed: number): GuessMode[] {
  if (mode !== "MIXED") return Array.from({ length: n }, () => mode);
  const rand = seededRandom(seed ^ 0x5bd1e995);
  const out: GuessMode[] = [];
  for (let i = 0; i < n; i++) {
    const options = GUESS_MODES.filter((m) => m !== out[i - 1]);
    out.push(options[Math.floor(rand() * options.length)]);
  }
  return out;
}

// ─── Daily challenge ──────────────────────────────────────────────────────

/** Day key for the daily challenge; the day turns at midnight in Türkiye (UTC+3). */
export function dayKey(now: number = Date.now()): string {
  return new Date(now + 3 * 3600_000).toISOString().slice(0, 10);
}

export function previousDayKey(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Milliseconds until the next daily challenge. */
export function msUntilNextDay(now: number = Date.now()): number {
  const local = now + 3 * 3600_000;
  const next = Math.floor(local / 86_400_000 + 1) * 86_400_000;
  return next - local;
}

/** Everyone gets the same characters and picture styles on the same day. */
export function dailySet<T extends PoolCharacter>(all: T[], key: string): { characters: T[]; modes: GuessMode[] } {
  const seed = hashString(`daily:${key}`);
  const pool = poolFor(all, { difficulty: "NORMAL" });
  return { characters: pickCharacters(pool, DAILY_ROUNDS, seed), modes: modesFor("MIXED", DAILY_ROUNDS, seed) };
}

// ─── Hints ────────────────────────────────────────────────────────────────

/** "Roronoa Zoro" → "R. Z." */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join(" ");
}

/** Text hints that unlock with the stages: the anime at stage 1, initials at stage 3. */
export function hintsFor(stage: number, c: { name: string; animeId: string }): { animeId: string | null; initials: string | null } {
  return { animeId: stage >= 1 ? c.animeId : null, initials: stage >= LAST_STAGE ? initialsOf(c.name) : null };
}

/** Accent- and case-insensitive text for searching names (Turkish aware). */
export function searchKey(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
