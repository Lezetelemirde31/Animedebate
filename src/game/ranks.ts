import type { Locale } from "@/lib/i18n";

/**
 * Ten player ranks, derived from the player's level (which comes from XP).
 * Nothing extra is stored: a player's rank is always `rankForLevel(level)`.
 */
export interface RankInfo {
  /** 1 (lowest) … 10 (highest). */
  tier: number;
  id: string;
  minLevel: number;
  name: Record<Locale, string>;
  color: string;
  /** Anime Coins granted once when the rank is reached. */
  coinBonus: number;
}

export const RANKS: readonly RankInfo[] = [
  { tier: 1, id: "beginner", minLevel: 1, name: { tr: "Çaylak", en: "Beginner" }, color: "#a1a1aa", coinBonus: 0 },
  { tier: 2, id: "novice", minLevel: 3, name: { tr: "Acemi", en: "Novice" }, color: "#94a3b8", coinBonus: 50 },
  { tier: 3, id: "apprentice", minLevel: 5, name: { tr: "Çırak", en: "Apprentice" }, color: "#38bdf8", coinBonus: 75 },
  { tier: 4, id: "warrior", minLevel: 8, name: { tr: "Savaşçı", en: "Warrior" }, color: "#22c55e", coinBonus: 100 },
  { tier: 5, id: "expert", minLevel: 12, name: { tr: "Usta", en: "Expert" }, color: "#a3e635", coinBonus: 150 },
  { tier: 6, id: "elite", minLevel: 16, name: { tr: "Elit", en: "Elite" }, color: "#a855f7", coinBonus: 200 },
  { tier: 7, id: "hero", minLevel: 21, name: { tr: "Kahraman", en: "Hero" }, color: "#e879f9", coinBonus: 300 },
  { tier: 8, id: "legend", minLevel: 27, name: { tr: "Efsane", en: "Legend" }, color: "#f59e0b", coinBonus: 400 },
  { tier: 9, id: "mythic", minLevel: 34, name: { tr: "Mitik", en: "Mythic" }, color: "#f43f5e", coinBonus: 600 },
  { tier: 10, id: "anime-emperor", minLevel: 42, name: { tr: "Anime İmparatoru", en: "Anime Emperor" }, color: "#fde047", coinBonus: 1000 },
];

export function rankForLevel(level: number): RankInfo {
  let current = RANKS[0];
  for (const r of RANKS) if (level >= r.minLevel) current = r;
  return current;
}

export function nextRank(level: number): RankInfo | null {
  return RANKS.find((r) => r.minLevel > level) ?? null;
}

/** XP needed to reach a level (inverse of `levelFromXp`). */
export function xpForLevel(level: number): number {
  return 50 * (Math.max(1, level) - 1) ** 2;
}

/** Progress (0–1) from the current rank to the next one, by XP. */
export function rankProgress(xp: number, level: number): { rank: RankInfo; next: RankInfo | null; ratio: number; xpToNext: number } {
  const rank = rankForLevel(level);
  const next = nextRank(level);
  if (!next) return { rank, next: null, ratio: 1, xpToNext: 0 };
  const from = xpForLevel(rank.minLevel);
  const to = xpForLevel(next.minLevel);
  return { rank, next, ratio: Math.min(1, Math.max(0, (xp - from) / (to - from))), xpToNext: Math.max(0, to - xp) };
}
