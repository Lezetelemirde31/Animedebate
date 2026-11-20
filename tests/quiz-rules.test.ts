import { describe, expect, it } from "vitest";
import { getCatalog } from "@/data/characters";
import { ENABLED_ANIME } from "@/data/anime";
import { fiftyFiftyHide, levelsFor, quizPoints, quizRacePoints, seededRandom } from "@/game/quiz/rules";
import { QUESTION_BANK } from "@/server/quiz/bank";
import { pickQuestions, questionCounts } from "@/server/quiz/questions";
import { optionOrder } from "@/server/quiz/race";

const enabled = new Set(ENABLED_ANIME.map((a) => a.id));
const chars = getCatalog()
  .filter((c) => enabled.has(c.animeId))
  .map((c) => ({ id: c.id, name: c.name, animeId: c.animeId, rarity: c.rarity, abilities: c.abilities }));

describe("question bank", () => {
  it("every question has a unique id and four different options in both languages", () => {
    const ids = new Set<string>();
    for (const q of QUESTION_BANK) {
      expect(ids.has(q.id), q.id).toBe(false);
      ids.add(q.id);
      expect(enabled.has(q.animeId), q.id).toBe(true);
      for (const lang of [q.tr, q.en]) {
        expect(lang.q.trim().length, q.id).toBeGreaterThan(8);
        expect(lang.options).toHaveLength(4);
        expect(new Set(lang.options.map((o) => o.trim().toLowerCase())).size, `${q.id} options`).toBe(4);
        for (const o of lang.options) expect(o.trim().length, q.id).toBeGreaterThan(0);
      }
    }
  });

  it("covers every enabled anime at every level", () => {
    for (const anime of enabled) {
      const mine = QUESTION_BANK.filter((q) => q.animeId === anime);
      expect(mine.length, anime).toBeGreaterThanOrEqual(15);
      expect(new Set(mine.map((q) => q.level)).has(1), anime).toBe(true);
    }
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(200);
  });

  it("has an odd-one-out question for every series", () => {
    expect(questionCounts(chars).generated).toBe(enabled.size);
  });
});

describe("picking questions", () => {
  it("an odd-one-out question's answer is really from another series", () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const q of pickQuestions(chars, { animeId: null, difficulty: "EASY", count: 10, seed }).filter((x) => x.id.startsWith("gen-odd-"))) {
        const series = q.id.replace("gen-odd-", "");
        const family = (a: string) => (a === "boruto" ? "naruto" : a);
        const answer = chars.find((c) => c.name === q.tr.options[q.correct])!;
        expect(family(answer.animeId)).not.toBe(family(series));
        for (const [i, name] of q.tr.options.entries()) if (i !== q.correct) expect(chars.find((c) => c.name === name && c.animeId === series), name).toBeTruthy();
      }
    }
  });

  it("returns different questions with the correct option kept track of", () => {
    const set = pickQuestions(chars, { animeId: null, difficulty: "MIXED", count: 10, seed: 7 });
    expect(set).toHaveLength(10);
    expect(new Set(set.map((q) => q.tr.q)).size).toBe(10);
    for (const q of set) {
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(4);
      expect(q.tr.options).toHaveLength(4);
      expect(q.en.options).toHaveLength(4);
    }
    // The correct answer isn't always in the same place.
    const many = pickQuestions(chars, { animeId: null, difficulty: "MIXED", count: 40, seed: 3 });
    expect(new Set(many.map((q) => q.correct)).size).toBeGreaterThan(2);
  });

  it("the same seed gives the same set; filters are respected", () => {
    const a = pickQuestions(chars, { animeId: null, difficulty: "MIXED", count: 10, seed: 42 });
    const b = pickQuestions(chars, { animeId: null, difficulty: "MIXED", count: 10, seed: 42 });
    expect(a).toEqual(b);
    for (const anime of enabled) {
      const set = pickQuestions(chars, { animeId: anime, difficulty: "MIXED", count: 10, seed: 1 });
      expect(set.length, anime).toBe(10);
      expect(set.every((q) => q.animeId === anime)).toBe(true);
    }
    const easy = pickQuestions(chars, { animeId: null, difficulty: "EASY", count: 10, seed: 5 });
    expect(easy.every((q) => q.level === 1)).toBe(true);
    const hard = pickQuestions(chars, { animeId: null, difficulty: "HARD", count: 10, seed: 5 });
    expect(hard.every((q) => q.level >= 2)).toBe(true);
  });
});

describe("scoring and jokers", () => {
  it("faster, harder answers and streaks score more", () => {
    expect(quizPoints({ level: 1, secondsLeft: 14, streak: 1 })).toBeGreaterThan(quizPoints({ level: 1, secondsLeft: 2, streak: 1 }));
    expect(quizPoints({ level: 3, secondsLeft: 5, streak: 1 })).toBeGreaterThan(quizPoints({ level: 1, secondsLeft: 5, streak: 1 }));
    expect(quizPoints({ level: 1, secondsLeft: 5, streak: 4 })).toBe(quizPoints({ level: 1, secondsLeft: 5, streak: 1 }) + 30);
    expect(quizRacePoints({ secondsLeft: 10, first: true })).toBeGreaterThan(quizRacePoints({ secondsLeft: 10, first: false }));
    expect(levelsFor("EASY")).toEqual([1]);
  });

  it("50/50 hides two wrong options and never the right one", () => {
    for (let correct = 0; correct < 4; correct++) {
      for (let s = 0; s < 20; s++) {
        const hide = fiftyFiftyHide(correct, seededRandom(s));
        expect(hide).toHaveLength(2);
        expect(hide).not.toContain(correct);
      }
    }
  });

  it("each player sees the options in their own order", () => {
    const a = optionOrder(99, "player-a", 0);
    expect([...a].sort()).toEqual([0, 1, 2, 3]);
    const orders = new Set(["p1", "p2", "p3", "p4", "p5", "p6"].map((p) => optionOrder(99, p, 0).join("")));
    expect(orders.size).toBeGreaterThan(1);
    expect(optionOrder(99, "player-a", 0)).toEqual(a);
  });
});
