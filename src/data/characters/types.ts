import type { Rarity } from "@/game/rarity";
import type { PowerTierCode } from "@/game/power-tier";

/** A curated character entry. The full id is `${animeId}-${slug}`. */
export interface CharacterSeed {
  slug: string;
  name: string;
  /** Short epithet shown under the name. */
  title: string;
  /** Canonical peak/prime form used for tier & score calculation. */
  primeForm: string;
  /** In-universe / VS-scale tier code (e.g. "2-C", "4-C", "High 6-A", "9-B"). */
  tierCode: PowerTierCode;
  description: string;
  abilities: string[];
  rarity: Rarity;
  /** 1–100 power rating derived from primeForm and tierCode. */
  powerLevel: number;
  /** Override for the artwork lookup if the display name is ambiguous. */
  searchName?: string;
  /** Exact AniList character id for the artwork lookup (wins over searchName). */
  anilistId?: number;
}

export interface AnimeCharacterSet {
  animeId: string;
  characters: CharacterSeed[];
}
