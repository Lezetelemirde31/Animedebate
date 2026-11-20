import { describe, expect, it } from "vitest";
import { getCatalog } from "@/data/characters";
import { CHARACTER_TEXT_TR } from "@/data/characters/tr";
import { characterTitle, localizeCharacter } from "@/lib/character-text";

describe("Turkish character texts", () => {
  const catalog = getCatalog();

  it("covers every character, with one ability name per English ability", () => {
    const missing = catalog.filter((c) => !CHARACTER_TEXT_TR[c.id]).map((c) => c.id);
    expect(missing).toEqual([]);
    const mismatched = catalog
      .filter((c) => CHARACTER_TEXT_TR[c.id] && CHARACTER_TEXT_TR[c.id].abilities.length !== c.abilities.length)
      .map((c) => c.id);
    expect(mismatched).toEqual([]);
  });

  it("has no entries for characters that do not exist", () => {
    const ids = new Set(catalog.map((c) => c.id));
    expect(Object.keys(CHARACTER_TEXT_TR).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("has non-empty texts", () => {
    for (const [id, t] of Object.entries(CHARACTER_TEXT_TR)) {
      expect(t.title.trim(), id).not.toBe("");
      expect(t.description.trim().length, id).toBeGreaterThan(20);
      expect(t.abilities.every((a) => a.trim() !== ""), id).toBe(true);
    }
  });

  it("localizes for Turkish and leaves English untouched", () => {
    const c = catalog.find((x) => x.id === "naruto-naruto-uzumaki")!;
    const tr = localizeCharacter(c, "tr");
    expect(tr.title).toBe(CHARACTER_TEXT_TR[c.id].title);
    expect(tr.description).toBe(CHARACTER_TEXT_TR[c.id].description);
    expect(tr.name).toBe(c.name);
    expect(localizeCharacter(c, "en")).toBe(c);
    expect(characterTitle(c.id, c.title, "en")).toBe(c.title);
    expect(characterTitle("unknown-id", "Fallback", "tr")).toBe("Fallback");
  });
});
