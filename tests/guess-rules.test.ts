import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { getCatalog } from "@/data/characters";
import images from "@/data/character-images.json";
import {
  DAILY_ROUNDS,
  GUESS_MODES,
  LAST_STAGE,
  dailySet,
  dayKey,
  effectLevel,
  hintsFor,
  initialsOf,
  modesFor,
  msUntilNextDay,
  pickCharacters,
  poolFor,
  previousDayKey,
  racePoints,
  raceStage,
  roundPoints,
  searchKey,
} from "@/game/guess/rules";
import { renderGuessImage } from "@/server/guess/image";

const imageOf = (id: string) => (images as Record<string, { url: string } | undefined>)[id]?.url ?? null;
const catalog = getCatalog().map((c) => ({ id: c.id, name: c.name, animeId: c.animeId, rarity: c.rarity, imageUrl: imageOf(c.id) }));

describe("Who Is This Character? rules", () => {
  it("earlier and faster answers score more; harder settings and streaks add", () => {
    const base = { secondsLeft: 15, difficulty: "NORMAL" as const, streak: 1 };
    const byStage = [0, 1, 2, 3].map((stage) => roundPoints({ ...base, stage }));
    expect(byStage).toEqual([...byStage].sort((a, b) => b - a));
    expect(roundPoints({ ...base, stage: 0, secondsLeft: 29 })).toBeGreaterThan(roundPoints({ ...base, stage: 0, secondsLeft: 2 }));
    expect(roundPoints({ ...base, stage: 0, difficulty: "HARD" })).toBeGreaterThan(roundPoints({ ...base, stage: 0, difficulty: "EASY" }));
    expect(roundPoints({ ...base, stage: 0, streak: 4 })).toBe(roundPoints({ ...base, stage: 0 }) + 15);
    expect(racePoints(0, 0)).toBeGreaterThan(racePoints(0, 1));
    expect(racePoints(0, 5)).toBeGreaterThan(racePoints(1, 0) - 31);
  });

  it("race pictures get clearer on a shared clock", () => {
    expect(raceStage(0)).toBe(0);
    expect(raceStage(6_999)).toBe(0);
    expect(raceStage(7_000)).toBe(1);
    expect(raceStage(60_000)).toBe(LAST_STAGE);
  });

  it("hard mode starts one level more disguised", () => {
    expect(effectLevel(0, "HARD")).toBe(0);
    expect(effectLevel(0, "NORMAL")).toBe(1);
    expect(effectLevel(LAST_STAGE, "EASY")).toBe(4);
  });

  it("easy uses well-known characters; every pick has a picture and no repeats", () => {
    const easy = poolFor(catalog, { difficulty: "EASY" });
    expect(easy.length).toBeGreaterThan(30);
    expect(easy.every((c) => ["EPIC", "LEGENDARY", "MYTHIC"].includes(c.rarity) && c.imageUrl)).toBe(true);
    const picks = pickCharacters(poolFor(catalog, { difficulty: "NORMAL" }), 10, 42);
    expect(new Set(picks.map((c) => c.id)).size).toBe(10);
    expect(pickCharacters(poolFor(catalog, { difficulty: "NORMAL" }), 10, 42)).toEqual(picks);
    const onePiece = poolFor(catalog, { difficulty: "NORMAL", animeId: "one-piece" });
    expect(onePiece.every((c) => c.animeId === "one-piece")).toBe(true);
  });

  it("mixed mode varies the picture style between rounds", () => {
    const m = modesFor("MIXED", 10, 7);
    for (let i = 1; i < m.length; i++) expect(m[i]).not.toBe(m[i - 1]);
    expect(new Set(m).size).toBeGreaterThan(2);
    expect(modesFor("EYES", 3, 1)).toEqual(["EYES", "EYES", "EYES"]);
  });

  it("the daily challenge is the same for everyone on a day and changes the next day", () => {
    const a = dailySet(catalog, "2026-11-18");
    const b = dailySet([...catalog].reverse(), "2026-11-18");
    expect(a.characters.map((c) => c.id)).toEqual(b.characters.map((c) => c.id));
    expect(a.characters).toHaveLength(DAILY_ROUNDS);
    expect(dailySet(catalog, "2026-11-19").characters.map((c) => c.id)).not.toEqual(a.characters.map((c) => c.id));
  });

  it("the day turns at midnight in Türkiye", () => {
    expect(dayKey(Date.UTC(2026, 10, 18, 20, 59))).toBe("2026-11-18");
    expect(dayKey(Date.UTC(2026, 10, 18, 21, 0))).toBe("2026-11-19");
    expect(previousDayKey("2026-03-01")).toBe("2026-02-28");
    expect(msUntilNextDay(Date.UTC(2026, 10, 18, 20, 0))).toBe(3600_000);
  });

  it("hints unlock with the stages", () => {
    const c = { name: "Roronoa Zoro", animeId: "one-piece" };
    expect(hintsFor(0, c)).toEqual({ animeId: null, initials: null });
    expect(hintsFor(1, c).animeId).toBe("one-piece");
    expect(hintsFor(LAST_STAGE, c).initials).toBe("R. Z.");
    expect(initialsOf("ichigo kurosaki")).toBe("I. K.");
  });

  it("name search ignores case, accents and Turkish letters", () => {
    expect(searchKey("Ōtsutsuki")).toBe(searchKey("otsutsuki"));
    expect(searchKey("IŞIK")).toBe("isik");
    expect(searchKey("Monkey D. Luffy")).toBe("monkey d luffy");
  });
});

describe("disguised pictures", () => {
  const local = catalog.find((c) => c.imageUrl?.startsWith("/"))!;

  it("renders every style as a WebP that changes with the stage", async () => {
    expect(local).toBeTruthy();
    for (const mode of GUESS_MODES) {
      const hard = await renderGuessImage(local.imageUrl!, mode, 0);
      const clear = await renderGuessImage(local.imageUrl!, mode, 4);
      const meta = await sharp(hard).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect(Buffer.compare(hard, clear)).not.toBe(0);
    }
  });

  it("a blurred picture carries less detail than the clear one", async () => {
    const blurred = await renderGuessImage(local.imageUrl!, "BLUR", 0);
    const clear = await renderGuessImage(local.imageUrl!, "BLUR", 4);
    expect(blurred.length).toBeLessThan(clear.length);
  });
});
