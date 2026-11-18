import { describe, expect, it } from "vitest";
import { getCatalog } from "@/data/characters";
import { characterScore } from "@/game/rarity";

/** Scores and rarities chosen by the site owner. */
describe("character scores", () => {
  const byId = new Map(getCatalog().map((c) => [c.id, c]));
  const get = (id: string) => {
    const c = byId.get(id);
    if (!c) throw new Error(`missing ${id}`);
    return c;
  };
  const score = (id: string) => characterScore(get(id));

  it("special Mythics", () => {
    expect(score("naruto-naruto-uzumaki")).toBe(12);
    expect(score("boruto-isshiki-otsutsuki")).toBe(12);
    expect(score("one-piece-imu")).toBe(12);
    expect(score("one-piece-joyboy")).toBe(12);
    expect(score("one-piece-rocks-d-xebec")).toBe(11);
  });

  it("every other Mythic is worth 10", () => {
    const special = new Set(["naruto-naruto-uzumaki", "boruto-isshiki-otsutsuki", "one-piece-imu", "one-piece-joyboy", "one-piece-rocks-d-xebec"]);
    for (const c of getCatalog()) {
      if (c.rarity === "MYTHIC" && !special.has(c.id)) expect(characterScore(c), c.id).toBe(10);
    }
  });

  it("Legendary scores", () => {
    const expected: Record<string, number> = {
      "naruto-minato-namikaze": 7,
      "naruto-might-guy": 7,
      "naruto-killer-b": 6,
      "naruto-hanzo": 6,
      "naruto-nagato": 5,
      "naruto-itachi-uchiha": 5,
      "naruto-tobirama-senju": 5,
      "naruto-orochimaru": 5,
      "naruto-hiruzen-sarutobi": 5,
      "naruto-jiraiya": 5,
      "naruto-shikamaru-nara": 5,
      "one-piece-silvers-rayleigh": 7,
      "one-piece-scopper-gaban": 6,
      "one-piece-akainu": 6,
    };
    for (const [id, s] of Object.entries(expected)) {
      expect(get(id).rarity, id).toBe("LEGENDARY");
      expect(score(id), id).toBe(s);
    }
  });

  it("rarities", () => {
    const expected: Record<string, string> = {
      "naruto-obito-uchiha": "MYTHIC",
      "naruto-kakashi-hatake": "MYTHIC",
      "boruto-momoshiki-otsutsuki": "MYTHIC",
      "naruto-rock-lee": "EPIC",
      "boruto-boro": "EPIC",
      "boruto-himawari-uzumaki": "RARE",
      "naruto-yahiko": "RARE",
      "one-piece-marshall-d-teach": "MYTHIC",
      "one-piece-monkey-d-dragon": "MYTHIC",
      "one-piece-monkey-d-garp": "MYTHIC",
      "one-piece-roronoa-zoro": "EPIC",
      "one-piece-sabo": "EPIC",
      "one-piece-koby": "EPIC",
      "one-piece-buggy": "EPIC",
      "one-piece-eustass-kid": "LEGENDARY",
      "one-piece-killer": "EPIC",
      "one-piece-marco": "EPIC",
      "one-piece-king": "EPIC",
      "one-piece-queen": "EPIC",
      "one-piece-jack": "EPIC",
      "one-piece-benn-beckman": "EPIC",
      "one-piece-kozuki-oden": "LEGENDARY",
      "one-piece-aokiji": "LEGENDARY",
      "one-piece-kizaru": "LEGENDARY",
      "one-piece-ryuma": "LEGENDARY",
      "one-piece-fujitora": "EPIC",
      "one-piece-rob-lucci": "RARE",
      "one-piece-portgas-d-ace": "RARE",
      "one-piece-enel": "EPIC",
      "one-piece-magellan": "EPIC",
      "one-piece-caesar-clown": "EPIC",
      "one-piece-x-drake": "RARE",
    };
    for (const [id, r] of Object.entries(expected)) expect(get(id).rarity, id).toBe(r);
  });
});
