import type { CharacterDTO } from "./types";
import type { Rarity } from "./rarity";
import type { PowerTierCode } from "./power-tier";

export type TacticalRole = "VANGUARD" | "TACTICIAN" | "BLITZ" | "BREAKER";

export const DECK_SIZE = 5;
export const DECK_MAX_POWER = 375;
export const ARENA_MAX_ROUNDS = 5;
export const ARENA_WINS_TO_WIN = 3;
/** How long a round's result stays on screen before the next round starts. */
export const ARENA_REVEAL_MS = 5_000;
export const ROLE_COUNTER_BONUS = 12;
export const ANIME_RIVALRY_BONUS = 6;

export interface ArenaCard {
  id: string;
  name: string;
  title: string;
  animeId: string;
  animeName: string;
  imageUrl: string | null;
  rarity: Rarity;
  powerLevel: number;
  primeForm?: string;
  tierCode?: PowerTierCode;
  role: TacticalRole;
  isStarter?: boolean;
}

export interface RoundResolution {
  roundNumber: number;
  attackerSeat: 0 | 1;
  defenderSeat: 0 | 1;
  attackerCard: ArenaCard;
  defenderCard: ArenaCard;
  attackerBasePower: number;
  defenderBasePower: number;
  attackerRoleBonus: number;
  defenderRoleBonus: number;
  defenderAnimeBonus: number;
  attackerTotal: number;
  defenderTotal: number;
  winnerSeat: 0 | 1 | null;
}

/**
 * 4-way Tactical Counter Cycle:
 * TACTICIAN > VANGUARD > BLITZ > BREAKER > TACTICIAN
 */
export const ROLE_COUNTERS: Record<TacticalRole, TacticalRole> = {
  TACTICIAN: "VANGUARD",
  VANGUARD: "BLITZ",
  BLITZ: "BREAKER",
  BREAKER: "TACTICIAN",
};

export const ROLE_META: Record<
  TacticalRole,
  {
    color: string;
    label: { tr: string; en: string };
    shortHint: { tr: string; en: string };
  }
> = {
  TACTICIAN: {
    color: "#a855f7",
    label: { tr: "Zeka & Hax", en: "Tactician" },
    shortHint: { tr: "Tanklara +12", en: "+12 vs Vanguard" },
  },
  VANGUARD: {
    color: "#f43f5e",
    label: { tr: "Saf Güç", en: "Vanguard" },
    shortHint: { tr: "Hızlılara +12", en: "+12 vs Blitz" },
  },
  BLITZ: {
    color: "#38bdf8",
    label: { tr: "Hız & Suikast", en: "Blitz" },
    shortHint: { tr: "İptalcilere +12", en: "+12 vs Breaker" },
  },
  BREAKER: {
    color: "#f59e0b",
    label: { tr: "İptal & Mühür", en: "Breaker" },
    shortHint: { tr: "Zekaya +12", en: "+12 vs Tactician" },
  },
};

/** 12 balanced starter cards across all 6 anime and all 4 roles so any player can duel immediately. */
export const STARTER_CHARACTER_IDS: readonly string[] = [
  "naruto-shikamaru-nara",
  "naruto-rock-lee",
  "naruto-sakura-haruno",
  "one-piece-jinbe",
  "one-piece-nico-robin",
  "bleach-orihime-inoue",
  "bleach-ikkaku-madarame",
  "black-clover-magna-swing",
  "black-clover-luck-voltia",
  "black-clover-secre-swallowtail",
  "boruto-shinki",
  "tokyo-revengers-manjiro-sano",
];

const STARTER_SET = new Set(STARTER_CHARACTER_IDS);

export function isStarterCharacter(id: string): boolean {
  return STARTER_SET.has(id);
}

/** Deterministically assigns one of 4 tactical roles based on abilities, title, and lore. */
export function getCharacterRole(
  character: Pick<CharacterDTO, "id" | "name" | "title" | "description" | "abilities">,
): TacticalRole {
  const haystack = `${character.title} ${character.description} ${character.abilities.join(" ")}`.toLowerCase();

  if (
    /anti-magic|antithesis|absorption|absorb|nullif|reject|sealing|seal|dark-dark|deathmatch|eras|soul chain|preta|almighty|sukunahikona|daikokuten/.test(
      haystack,
    )
  ) {
    return "BREAKER";
  }

  if (
    /genjutsu|tsukuyomi|kyōka|hypnosis|future|prescience|time leap|time magic|foresight|strateg|tactic|iq|manipul|mastermind|fate|rouge|mind|poison|intellect|room|shambles|deception|medical|kannonbiraki|karamatsu|barrier/.test(
      haystack,
    )
  ) {
    return "TACTICIAN";
  }

  if (
    /flying|thunder|lightning|shunpo|sonído|flash|speed|fastest|blitz|teleport|spatial|vanish|katana|sword|kick|velocity|hirenkyaku/.test(
      haystack,
    )
  ) {
    return "BLITZ";
  }

  return "VANGUARD";
}

export function toArenaCard(c: CharacterDTO, opts?: { isStarter?: boolean }): ArenaCard {
  return {
    id: c.id,
    name: c.name,
    title: c.title,
    animeId: c.animeId,
    animeName: c.animeName,
    imageUrl: c.imageUrl,
    rarity: c.rarity,
    powerLevel: c.powerLevel ?? 50,
    primeForm: c.primeForm,
    tierCode: c.tierCode,
    role: getCharacterRole(c),
    isStarter: opts?.isStarter,
  };
}

export function roleCounters(attackerRole: TacticalRole, targetRole: TacticalRole): boolean {
  return ROLE_COUNTERS[attackerRole] === targetRole;
}

export function previewCounterBonuses(
  attackerCard: Pick<ArenaCard, "role" | "animeId" | "powerLevel">,
  defenderCard: Pick<ArenaCard, "role" | "animeId" | "powerLevel">,
) {
  const attackerRoleBonus = roleCounters(attackerCard.role, defenderCard.role) ? ROLE_COUNTER_BONUS : 0;
  const defenderRoleBonus = roleCounters(defenderCard.role, attackerCard.role) ? ROLE_COUNTER_BONUS : 0;
  const defenderAnimeBonus = defenderCard.animeId === attackerCard.animeId ? ANIME_RIVALRY_BONUS : 0;
  const attackerTotal = attackerCard.powerLevel + attackerRoleBonus;
  const defenderTotal = defenderCard.powerLevel + defenderRoleBonus + defenderAnimeBonus;
  return {
    attackerRoleBonus,
    defenderRoleBonus,
    defenderAnimeBonus,
    attackerTotal,
    defenderTotal,
  };
}

export function resolveArenaRound(
  roundNumber: number,
  attackerSeat: 0 | 1,
  attackerCard: ArenaCard,
  defenderCard: ArenaCard,
): RoundResolution {
  const defenderSeat: 0 | 1 = attackerSeat === 0 ? 1 : 0;
  const calc = previewCounterBonuses(attackerCard, defenderCard);
  const winnerSeat: 0 | 1 | null =
    calc.defenderTotal > calc.attackerTotal
      ? defenderSeat
      : calc.attackerTotal > calc.defenderTotal
        ? attackerSeat
        : null;

  return {
    roundNumber,
    attackerSeat,
    defenderSeat,
    attackerCard,
    defenderCard,
    attackerBasePower: attackerCard.powerLevel,
    defenderBasePower: defenderCard.powerLevel,
    attackerRoleBonus: calc.attackerRoleBonus,
    defenderRoleBonus: calc.defenderRoleBonus,
    defenderAnimeBonus: calc.defenderAnimeBonus,
    attackerTotal: calc.attackerTotal,
    defenderTotal: calc.defenderTotal,
    winnerSeat,
  };
}

export type DeckValidationResult =
  | { ok: true; totalPower: number; cards: ArenaCard[] }
  | {
      ok: false;
      reason: "WRONG_SIZE" | "DUPLICATE_CARDS" | "UNOWNED_CARD" | "OVER_BUDGET";
      totalPower: number;
    };

export function validateDeck(
  cardIds: string[],
  allowedIds: Set<string>,
  catalogById: Map<string, ArenaCard>,
): DeckValidationResult {
  if (cardIds.length !== DECK_SIZE) {
    return { ok: false, reason: "WRONG_SIZE", totalPower: 0 };
  }
  const unique = new Set(cardIds);
  if (unique.size !== DECK_SIZE) {
    return { ok: false, reason: "DUPLICATE_CARDS", totalPower: 0 };
  }
  const cards: ArenaCard[] = [];
  let totalPower = 0;
  for (const id of cardIds) {
    const card = catalogById.get(id);
    if (!card || !allowedIds.has(id)) {
      return { ok: false, reason: "UNOWNED_CARD", totalPower };
    }
    cards.push(card);
    totalPower += card.powerLevel;
  }
  if (totalPower > DECK_MAX_POWER) {
    return { ok: false, reason: "OVER_BUDGET", totalPower };
  }
  return { ok: true, totalPower, cards };
}

/** Builds a valid, role-diverse 5-card deck under DECK_MAX_POWER from a player's available cards. */
export function buildAutoDeck(pool: ArenaCard[], rng?: () => number): ArenaCard[] {
  if (pool.length <= DECK_SIZE) return pool.slice(0, DECK_SIZE);

  const sortedDesc = [...pool].sort((a, b) => b.powerLevel - a.powerLevel || a.id.localeCompare(b.id));
  const sortedAsc = [...pool].sort((a, b) => a.powerLevel - b.powerLevel || a.id.localeCompare(b.id));

  const candidates = sortedDesc.slice(0, Math.min(pool.length, 36));
  const attempts = rng ? 40 : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const picked: ArenaCard[] = [];
    const usedIds = new Set<string>();
    const rolesSeen = new Set<TacticalRole>();
    let sum = 0;

    for (let slot = 0; slot < DECK_SIZE; slot++) {
      const remainingSlots = DECK_SIZE - slot - 1;
      const minReserve = remainingSlots * (sortedAsc[0]?.powerLevel ?? 10);
      const maxAllowed = DECK_MAX_POWER - sum - minReserve;

      const eligible = (slot < 3 ? candidates : sortedDesc).filter((c) => !usedIds.has(c.id) && c.powerLevel <= maxAllowed);
      if (eligible.length === 0) break;

      const roleDiverse = eligible.filter((c) => !rolesSeen.has(c.role));
      const bucket = roleDiverse.length > 0 ? roleDiverse : eligible;
      const topSlice = bucket.slice(0, Math.min(bucket.length, slot < 2 ? 6 : 4));
      const choice = rng ? topSlice[Math.floor(rng() * topSlice.length)] : topSlice[0];
      picked.push(choice);
      usedIds.add(choice.id);
      rolesSeen.add(choice.role);
      sum += choice.powerLevel;
    }

    if (picked.length === DECK_SIZE && sum <= DECK_MAX_POWER) {
      return picked;
    }
  }

  // Deterministic fallback: cheapest 5 cards
  return sortedAsc.slice(0, DECK_SIZE);
}

/**
 * Tactical AI card selection:
 * - On ATTACK: prefers mid-power or bait cards early while preserving its ace for counter-picks.
 * - On DEFEND: picks the cheapest card that beats the Attacker (maximizing leftover power),
 *   or sacrifices its weakest card if no card can win.
 */
export function chooseBotCard(
  turn: "ATTACK" | "DEFEND",
  botHand: ArenaCard[],
  attackerCard: ArenaCard | null,
  rng: () => number = Math.random,
): ArenaCard {
  if (botHand.length === 0) {
    throw new Error("Bot hand is empty");
  }
  if (turn === "ATTACK" || !attackerCard) {
    const sorted = [...botHand].sort((a, b) => a.powerLevel - b.powerLevel);
    if (sorted.length <= 2) return sorted[sorted.length - 1];
    // Pick between cheapest bait and mid card to draw out opponent's high-tier cards
    const idx = Math.min(sorted.length - 1, Math.floor(rng() * Math.min(3, sorted.length)));
    return sorted[idx];
  }

  const evaluations = botHand.map((card) => ({
    card,
    res: previewCounterBonuses(attackerCard, card),
  }));

  const winners = evaluations
    .filter((e) => e.res.defenderTotal > e.res.attackerTotal)
    .sort((a, b) => a.card.powerLevel - b.card.powerLevel || b.res.defenderTotal - a.res.defenderTotal);

  if (winners.length > 0) {
    return winners[0].card;
  }

  // No winning play: tie if possible, otherwise dump weakest card
  const ties = evaluations
    .filter((e) => e.res.defenderTotal === e.res.attackerTotal)
    .sort((a, b) => a.card.powerLevel - b.card.powerLevel);
  if (ties.length > 0) return ties[0].card;

  return [...botHand].sort((a, b) => a.powerLevel - b.powerLevel)[0];
}
