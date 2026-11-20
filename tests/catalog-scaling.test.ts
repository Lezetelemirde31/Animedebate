import { describe, expect, it } from "vitest";
import { getCatalog, getCharacterScaling } from "@/data/characters";
import { POWER_TIER_INFO, isValidTierScore } from "@/game/power-tier";
import { rarityRank } from "@/game/rarity";

describe("character prime-form tier & score scaling", () => {
  const catalog = getCatalog();
  const byId = new Map(catalog.map((c) => [c.id, c]));

  it("assigns every character a primeForm, tierCode, and integer powerLevel inside its tier band", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(140);
    for (const c of catalog) {
      expect(c.primeForm.trim().length).toBeGreaterThan(2);
      expect(POWER_TIER_INFO[c.tierCode]).toBeDefined();
      expect(isValidTierScore(c.tierCode, c.powerLevel)).toBe(true);
      expect(c.powerLevel).toBeGreaterThanOrEqual(1);
      expect(c.powerLevel).toBeLessThanOrEqual(100);
      expect(getCharacterScaling(c.id)).toEqual({ primeForm: c.primeForm, tierCode: c.tierCode });
    }
  });

  it("maintains prime-form in-verse Mythic & Legendary hierarchy", () => {
    const score = (id: string) => {
      const c = byId.get(id);
      if (!c) throw new Error(`Missing character ${id}`);
      return c.powerLevel;
    };

    // Naruto: Baryon Naruto > Juubidara > Six Paths Sasuke > DMS Kakashi > Juubito > Night Guy > Hashirama
    expect(score("naruto-naruto-uzumaki")).toBeGreaterThan(score("naruto-madara-uchiha"));
    expect(score("naruto-madara-uchiha")).toBeGreaterThanOrEqual(score("naruto-sasuke-uchiha"));
    expect(score("naruto-sasuke-uchiha")).toBeGreaterThan(score("naruto-hashirama-senju"));
    expect(score("naruto-kakashi-hatake")).toBeGreaterThan(score("naruto-obito-uchiha"));
    expect(score("naruto-might-guy")).toBeGreaterThan(score("naruto-hashirama-senju"));

    // Boruto: Isshiki > TBV Boruto > Kawaki/Code > Fused Momoshiki
    expect(score("boruto-isshiki-otsutsuki")).toBeGreaterThan(score("boruto-boruto-uzumaki"));
    expect(score("boruto-boruto-uzumaki")).toBeGreaterThan(score("boruto-momoshiki-otsutsuki"));

    // One Piece: Prime Roger (the strongest, by the owner's choice) > Prime Whitebeard == Gear 5 Luffy == Kaido >= Shanks == Mihawk > Big Mom/Blackbeard > Zoro/Law
    expect(score("one-piece-gol-d-roger")).toBeGreaterThan(score("one-piece-edward-newgate"));
    for (const c of catalog.filter((x) => x.animeId === "one-piece" && x.id !== "one-piece-gol-d-roger")) {
      expect(score("one-piece-gol-d-roger"), c.id).toBeGreaterThan(c.powerLevel);
    }
    expect(score("one-piece-edward-newgate")).toBe(score("one-piece-kaido"));
    expect(score("one-piece-monkey-d-luffy")).toBe(score("one-piece-kaido"));
    expect(score("one-piece-shanks")).toBe(score("one-piece-dracule-mihawk"));
    expect(score("one-piece-monkey-d-luffy")).toBeGreaterThan(score("one-piece-roronoa-zoro"));

    // Bleach: SK Yhwach > True Bankai Ichigo > Muken Aizen > Bankai Yamamoto > Antithesis Uryū > Bankai Kenpachi
    expect(score("bleach-yhwach")).toBeGreaterThan(score("bleach-ichigo-kurosaki"));
    expect(score("bleach-ichigo-kurosaki")).toBeGreaterThan(score("bleach-sosuke-aizen"));
    expect(score("bleach-sosuke-aizen")).toBeGreaterThan(score("bleach-genryusai-yamamoto"));
    expect(score("bleach-genryusai-yamamoto")).toBeGreaterThan(score("bleach-uryu-ishida"));
    expect(score("bleach-uryu-ishida")).toBeGreaterThan(score("bleach-kenpachi-zaraki"));

    // Black Clover: Lucius/Julius > True Devil Union Asta == Star Yuno > Hellfire Mereoleona
    expect(score("black-clover-julius-novachrono")).toBeGreaterThan(score("black-clover-asta"));
    expect(score("black-clover-asta")).toBe(score("black-clover-yuno"));
    expect(score("black-clover-asta")).toBeGreaterThan(score("black-clover-mereoleona-vermillion"));

    // Tokyo Revengers: Dark Impulse Mikey > Izana > Prime Draken > Taiju/Kakucho
    expect(score("tokyo-revengers-manjiro-sano")).toBeGreaterThan(score("tokyo-revengers-izana-kurokawa"));
    expect(score("tokyo-revengers-izana-kurokawa")).toBeGreaterThan(score("tokyo-revengers-ken-ryuguji"));
    expect(score("tokyo-revengers-ken-ryuguji")).toBeGreaterThan(score("tokyo-revengers-taiju-shiba"));
  });

  it("enforces cross-verse tier separation and higher average score for rarer tiers within each anime", () => {
    const mikey = byId.get("tokyo-revengers-manjiro-sano")!;
    const naruto = byId.get("naruto-naruto-uzumaki")!;
    const luffy = byId.get("one-piece-monkey-d-luffy")!;
    const ichigo = byId.get("bleach-ichigo-kurosaki")!;
    expect(ichigo.powerLevel).toBeGreaterThan(naruto.powerLevel);
    expect(naruto.powerLevel).toBeGreaterThan(luffy.powerLevel);
    expect(luffy.powerLevel).toBeGreaterThan(mikey.powerLevel);

    const byAnime = new Map<string, typeof catalog>();
    for (const c of catalog) {
      const list = byAnime.get(c.animeId) ?? [];
      list.push(c);
      byAnime.set(c.animeId, list);
    }

    for (const [animeId, list] of byAnime) {
      const avg = (r: string) => {
        const sub = list.filter((c) => c.rarity === r);
        return sub.reduce((sum, c) => sum + c.powerLevel, 0) / sub.length;
      };
      // Tokyo Revengers keeps protagonist Takemichi (9-C) in MYTHIC, so check LEGENDARY > EPIC > RARE > COMMON
      if (animeId !== "tokyo-revengers") {
        expect(avg("MYTHIC")).toBeGreaterThan(avg("LEGENDARY"));
      }
      expect(avg("LEGENDARY")).toBeGreaterThan(avg("EPIC"));
      expect(avg("EPIC")).toBeGreaterThan(avg("RARE"));
      expect(avg("RARE")).toBeGreaterThan(avg("COMMON"));
      expect(rarityRank("MYTHIC")).toBeGreaterThan(rarityRank("LEGENDARY"));
    }
  });
});
