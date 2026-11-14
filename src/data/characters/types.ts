import type { Rarity } from "@/game/rarity";

/** A curated character entry. The full id is `${animeId}-${slug}`. */
export interface CharacterSeed {
  slug: string;
  name: string;
  /** Short epithet shown under the name. */
  title: string;
  description: string;
  abilities: string[];
  rarity: Rarity;
  /** Optional 1–100 power rating used for display and sorting. */
  powerLevel?: number;
  /** Override for the artwork lookup if the display name is ambiguous. */
  searchName?: string;
  /** Exact AniList character id for the artwork lookup (wins over searchName). */
  anilistId?: number;
}

export interface AnimeCharacterSet {
  animeId: string;
  characters: CharacterSeed[];
}
