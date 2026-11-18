import { describe, expect, it } from "vitest";
import { getCatalog } from "@/data/characters";
import { ANIME } from "@/data/anime";
import {
  ANIME_RIVALRY_BONUS,
  DECK_MAX_POWER,
  DECK_SIZE,
  ROLE_COUNTERS,
  ROLE_COUNTER_BONUS,
  STARTER_CHARACTER_IDS,
  buildAutoDeck,
  chooseBotCard,
  getCharacterRole,
  previewCounterBonuses,
  resolveArenaRound,
  roleCounters,
  toArenaCard,
  validateDeck,
  type ArenaCard,
  type TacticalRole,
} from "@/game/arena";

function makeCatalogPool() {
  const animeMap = new Map(ANIME.map((a) => [a.id, a.shortName]));
  const catalog = getCatalog();
  const cards: ArenaCard[] = catalog.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    animeId: c.animeId,
    animeName: animeMap.get(c.animeId) ?? c.animeId,
    imageUrl: null,
    rarity: c.rarity,
    powerLevel: c.powerLevel,
    primeForm: c.primeForm,
    tierCode: c.tierCode,
    role: getCharacterRole(c),
    isStarter: STARTER_CHARACTER_IDS.includes(c.id),
  }));
  return {
    catalog,
    cards,
    byId: new Map(cards.map((c) => [c.id, c])),
  };
}

describe("Deck Arena pure game logic", () => {
  it("keeps a complete 4-way tactical counter cycle", () => {
    expect(roleCounters("TACTICIAN", "VANGUARD")).toBe(true);
    expect(roleCounters("VANGUARD", "BLITZ")).toBe(true);
    expect(roleCounters("BLITZ", "BREAKER")).toBe(true);
    expect(roleCounters("BREAKER", "TACTICIAN")).toBe(true);

    expect(roleCounters("VANGUARD", "TACTICIAN")).toBe(false);
    expect(roleCounters("BLITZ", "VANGUARD")).toBe(false);
    expect(roleCounters("BREAKER", "BLITZ")).toBe(false);
    expect(roleCounters("TACTICIAN", "BREAKER")).toBe(false);

    // Every role counters exactly one role
    const targets = new Set(Object.values(ROLE_COUNTERS));
    expect(targets.size).toBe(4);
  });

  it("starter pool covers all 6 anime and all 4 tactical roles within budget", () => {
    const { byId } = makeCatalogPool();
    const starters = STARTER_CHARACTER_IDS.map((id) => {
      const card = byId.get(id);
      expect(card, `missing starter ${id}`).toBeDefined();
      return card!;
    });

    const animeCovered = new Set(starters.map((s) => s.animeId));
    const rolesCovered = new Set<TacticalRole>(starters.map((s) => s.role));

    expect(animeCovered.size).toBe(6);
    expect(rolesCovered.size).toBe(4);

    const allowed = new Set(starters.map((s) => s.id));
    const autoDeck = buildAutoDeck(starters, () => 0.35);
    const deterministicA = buildAutoDeck(starters).map((c) => c.id);
    const deterministicB = buildAutoDeck(starters).map((c) => c.id);
    expect(deterministicA).toEqual(deterministicB);
    expect(autoDeck).toHaveLength(DECK_SIZE);
    const check = validateDeck(
      autoDeck.map((c) => c.id),
      allowed,
      byId,
    );
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.totalPower).toBeLessThanOrEqual(DECK_MAX_POWER);
    }
  });

  it("computes counter bonuses and same-anime defender advantage accurately", () => {
    const attacker: ArenaCard = {
      id: "atk",
      name: "Attacker",
      title: "Tank",
      animeId: "naruto",
      animeName: "Naruto",
      imageUrl: null,
      rarity: "EPIC",
      powerLevel: 70,
      role: "VANGUARD",
    };
    const defenderCounterSameAnime: ArenaCard = {
      id: "def",
      name: "Defender",
      title: "Mind",
      animeId: "naruto",
      animeName: "Naruto",
      imageUrl: null,
      rarity: "RARE",
      powerLevel: 60,
      role: "TACTICIAN",
    };

    const preview = previewCounterBonuses(attacker, defenderCounterSameAnime);
    expect(preview.attackerRoleBonus).toBe(0);
    expect(preview.defenderRoleBonus).toBe(ROLE_COUNTER_BONUS);
    expect(preview.defenderAnimeBonus).toBe(ANIME_RIVALRY_BONUS);
    expect(preview.attackerTotal).toBe(70);
    expect(preview.defenderTotal).toBe(60 + ROLE_COUNTER_BONUS + ANIME_RIVALRY_BONUS);

    const resolution = resolveArenaRound(1, 0, attacker, defenderCounterSameAnime);
    expect(resolution.winnerSeat).toBe(1);
    expect(resolution.defenderTotal).toBe(78);
    expect(resolution.attackerTotal).toBe(70);
  });

  it("returns null winnerSeat on exact tie", () => {
    const a: ArenaCard = {
      id: "a",
      name: "A",
      title: "A",
      animeId: "bleach",
      animeName: "Bleach",
      imageUrl: null,
      rarity: "RARE",
      powerLevel: 65,
      role: "VANGUARD",
    };
    const b: ArenaCard = {
      id: "b",
      name: "B",
      title: "B",
      animeId: "one-piece",
      animeName: "One Piece",
      imageUrl: null,
      rarity: "RARE",
      powerLevel: 65,
      role: "VANGUARD",
    };
    const res = resolveArenaRound(2, 1, a, b);
    expect(res.winnerSeat).toBeNull();
  });

  it("validates decks strictly for size, duplicates, ownership, and budget cap", () => {
    const { cards, byId } = makeCatalogPool();
    const allowed = new Set(cards.map((c) => c.id));

    expect(validateDeck(cards.slice(0, 4).map((c) => c.id), allowed, byId)).toMatchObject({
      ok: false,
      reason: "WRONG_SIZE",
    });

    const dupIds = [cards[0].id, cards[0].id, cards[1].id, cards[2].id, cards[3].id];
    expect(validateDeck(dupIds, allowed, byId)).toMatchObject({
      ok: false,
      reason: "DUPLICATE_CARDS",
    });

    const restricted = new Set(STARTER_CHARACTER_IDS);
    const unownedPick = cards.find((c) => !restricted.has(c.id))!;
    expect(
      validateDeck(
        [unownedPick.id, ...STARTER_CHARACTER_IDS.slice(0, 4)],
        restricted,
        byId,
      ),
    ).toMatchObject({
      ok: false,
      reason: "UNOWNED_CARD",
    });

    const topFiveExpensive = [...cards].sort((a, b) => b.powerLevel - a.powerLevel).slice(0, DECK_SIZE);
    const topSum = topFiveExpensive.reduce((s, c) => s + c.powerLevel, 0);
    expect(topSum).toBeGreaterThan(DECK_MAX_POWER);
    expect(validateDeck(topFiveExpensive.map((c) => c.id), allowed, byId)).toMatchObject({
      ok: false,
      reason: "OVER_BUDGET",
    });
  });

  it("chooses the cheapest counter-winning card when defending", () => {
    const attacker: ArenaCard = {
      id: "atk",
      name: "Garp",
      title: "Hero",
      animeId: "one-piece",
      animeName: "One Piece",
      imageUrl: null,
      rarity: "EPIC",
      powerLevel: 80,
      role: "VANGUARD",
    };

    const cheapCounter: ArenaCard = {
      id: "cheap-counter",
      name: "Law",
      title: "Surgeon",
      animeId: "one-piece",
      animeName: "One Piece",
      imageUrl: null,
      rarity: "RARE",
      powerLevel: 65, // 65 + 12 (role) + 6 (anime) = 83 > 80
      role: "TACTICIAN",
    };

    const expensiveAce: ArenaCard = {
      id: "ace",
      name: "Aizen",
      title: "Mastermind",
      animeId: "bleach",
      animeName: "Bleach",
      imageUrl: null,
      rarity: "MYTHIC",
      powerLevel: 95,
      role: "TACTICIAN",
    };

    const weakFiller: ArenaCard = {
      id: "weak",
      name: "Takemichi",
      title: "Hero",
      animeId: "tokyo-revengers",
      animeName: "Tokyo Revengers",
      imageUrl: null,
      rarity: "COMMON",
      powerLevel: 35,
      role: "VANGUARD",
    };

    const pick = chooseBotCard("DEFEND", [expensiveAce, weakFiller, cheapCounter], attacker);
    expect(pick.id).toBe("cheap-counter");
  });

  it("converts CharacterDTO safely via toArenaCard", () => {
    const first = getCatalog()[0];
    const card = toArenaCard(
      {
        id: first.id,
        name: first.name,
        title: first.title,
        animeId: first.animeId,
        animeName: "Naruto",
        imageUrl: null,
        description: first.description,
        abilities: first.abilities,
        rarity: first.rarity,
        powerLevel: first.powerLevel,
        score: first.score ?? 10,
        primeForm: first.primeForm,
        tierCode: first.tierCode,
      },
      { isStarter: true },
    );
    expect(card.isStarter).toBe(true);
    expect(card.powerLevel).toBe(first.powerLevel);
  });
});
