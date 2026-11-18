/** Rarity tiers — must stay in sync with the `Rarity` enum in prisma/schema.prisma. */
export const RARITIES = ["COMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"] as const;
export type Rarity = (typeof RARITIES)[number];

export interface RarityInfo {
  label: string;
  /** Points added to a player's match score when they win a character of this rarity. */
  points: number;
  /** Opening price of an auction lot for this rarity, in virtual dollars. */
  startingPrice: number;
  color: string;
  glow: string;
}

export const RARITY_INFO: Record<Rarity, RarityInfo> = {
  COMMON: { label: "Common", points: 1, startingPrice: 1, color: "#94a3b8", glow: "rgba(148,163,184,0.45)" },
  RARE: { label: "Rare", points: 2, startingPrice: 1, color: "#38bdf8", glow: "rgba(56,189,248,0.5)" },
  EPIC: { label: "Epic", points: 3, startingPrice: 1, color: "#a855f7", glow: "rgba(168,85,247,0.55)" },
  LEGENDARY: { label: "Legendary", points: 5, startingPrice: 2, color: "#f59e0b", glow: "rgba(245,158,11,0.55)" },
  MYTHIC: { label: "Mythic", points: 10, startingPrice: 3, color: "#f43f5e", glow: "rgba(244,63,94,0.6)" },
};

/**
 * Match score a character is worth: its own score when one is set (some
 * characters are worth more than their rarity's default), else the rarity's.
 */
export function characterScore(c: { rarity: Rarity; score?: number | null }): number {
  return c.score ?? RARITY_INFO[c.rarity].points;
}

export function isRarity(value: unknown): value is Rarity {
  return typeof value === "string" && (RARITIES as readonly string[]).includes(value);
}

export function rarityRank(r: Rarity): number {
  return RARITIES.indexOf(r);
}
