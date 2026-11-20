import "server-only";
/**
 * Builds quiz question sets from the hand-written bank, plus at most one
 * "which of these is not from <series>?" question built from series
 * membership. Options are shuffled per set; the index of the correct option
 * stays on the server.
 *
 * Questions are not generated from the character technique lists: several
 * famous techniques are used by more than one character in the series
 * (Amaterasu, Kamui, Chidori…), which would make generated questions unfair.
 */
import { ANIME, getAnime } from "@/data/anime";
import { levelsFor, seededRandom, shuffle, type QuestionLevel, type QuizCategory, type QuizDifficulty } from "@/game/quiz/rules";
import { QUESTION_BANK } from "./bank";

export interface QuizItem {
  id: string;
  animeId: string;
  level: QuestionLevel;
  category: QuizCategory;
  tr: { q: string; options: string[] };
  en: { q: string; options: string[] };
  /** Index of the correct option in `options` (same order in both languages). */
  correct: number;
}

export interface QuizCharacter {
  id: string;
  name: string;
  animeId: string;
  rarity: string;
  abilities: string[];
}

/** Series that share a universe (their characters can't be the "odd one out" of each other). */
const FAMILY: Record<string, string> = { naruto: "naruto", boruto: "naruto" };
const familyOf = (animeId: string) => FAMILY[animeId] ?? animeId;
const FAMOUS = new Set(["EPIC", "LEGENDARY", "MYTHIC"]);

interface Template {
  id: string;
  animeId: string;
  level: QuestionLevel;
  category: QuizCategory;
  make: (rand: () => number) => Omit<QuizItem, "correct" | "id" | "animeId" | "level" | "category"> | null;
}

/** "Which of these is not from <series>?" questions. */
function oddOneOutTemplates(chars: QuizCharacter[]): Template[] {
  return ANIME.filter((a) => a.enabled).map((anime) => ({
    id: `gen-odd-${anime.id}`,
    animeId: anime.id,
    level: 1 as QuestionLevel,
    category: "WORLD" as QuizCategory,
    make: (rand) => {
      const inside = chars.filter((c) => c.animeId === anime.id && FAMOUS.has(c.rarity));
      const outside = chars.filter((c) => familyOf(c.animeId) !== familyOf(anime.id) && FAMOUS.has(c.rarity));
      if (inside.length < 3 || outside.length < 1) return null;
      const odd = shuffle(outside, rand)[0];
      const three = shuffle(inside, rand).slice(0, 3).map((c) => c.name);
      const options = [odd.name, ...three];
      const name = getAnime(anime.id)?.name ?? anime.id;
      return { tr: { q: `Hangisi ${name} karakteri değildir?`, options }, en: { q: `Which of these is NOT a ${name} character?`, options } };
    },
  }));
}

function bankTemplates(): Template[] {
  return QUESTION_BANK.map((b) => ({
    id: b.id,
    animeId: b.animeId,
    level: b.level,
    category: b.category,
    make: () => ({ tr: { q: b.tr.q, options: [...b.tr.options] }, en: { q: b.en.q, options: [...b.en.options] } }),
  }));
}

/** Shuffles the options; the correct one is always first before shuffling. */
function finish(t: Template, made: NonNullable<ReturnType<Template["make"]>>, rand: () => number): QuizItem {
  const order = shuffle([0, 1, 2, 3], rand);
  return {
    id: t.id,
    animeId: t.animeId,
    level: t.level,
    category: t.category,
    tr: { q: made.tr.q, options: order.map((i) => made.tr.options[i]) },
    en: { q: made.en.q, options: order.map((i) => made.en.options[i]) },
    correct: order.indexOf(0),
  };
}

/** How many questions of each kind exist (for tests and the hub). */
export function questionCounts(chars: QuizCharacter[]) {
  return { bank: QUESTION_BANK.length, generated: oddOneOutTemplates(chars).length };
}

/**
 * Picks `count` different questions matching the anime and difficulty
 * filters: hand-written ones first, an odd-one-out question as filler.
 */
export function pickQuestions(chars: QuizCharacter[], opts: { animeId: string | null; difficulty: QuizDifficulty; count: number; seed: number }): QuizItem[] {
  const rand = seededRandom(opts.seed);
  const levels = new Set(levelsFor(opts.difficulty));
  const fits = (t: Template) => (!opts.animeId || t.animeId === opts.animeId) && levels.has(t.level);
  const sortId = (a: Template, b: Template) => a.id.localeCompare(b.id);
  const bank = shuffle(bankTemplates().filter(fits).sort(sortId), rand);
  const generated = shuffle(oddOneOutTemplates(chars).filter(fits).sort(sortId), rand);
  // Odd-one-out questions are easy filler: at most one per set.
  let oddUsed = false;
  // At most one odd-one-out question, placed among the hand-written ones.
  const fromBank = Math.min(bank.length, opts.count - 1);
  const queue = [...bank.slice(0, fromBank), ...generated, ...bank.slice(fromBank)];
  const out: QuizItem[] = [];
  const usedText = new Set<string>();
  for (const t of queue) {
    if (out.length >= opts.count) break;
    if (t.id.startsWith("gen-odd-")) {
      if (oddUsed) continue;
      oddUsed = true;
    }
    const made = t.make(rand);
    if (!made || usedText.has(made.tr.q)) continue;
    usedText.add(made.tr.q);
    out.push(finish(t, made, rand));
  }
  return shuffle(out, rand);
}
