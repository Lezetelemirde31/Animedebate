import { ANIME } from "../anime";
import type { AnimeCharacterSet, CharacterSeed } from "./types";
import { narutoCharacters } from "./naruto";
import { borutoCharacters } from "./boruto";
import { onePieceCharacters } from "./one-piece";
import { blackCloverCharacters } from "./black-clover";
import { bleachCharacters } from "./bleach";
import { tokyoRevengersCharacters } from "./tokyo-revengers";

/** Register new anime character sets here. */
export const CHARACTER_SETS: AnimeCharacterSet[] = [
  narutoCharacters,
  borutoCharacters,
  onePieceCharacters,
  blackCloverCharacters,
  bleachCharacters,
  tokyoRevengersCharacters,
];

export interface CatalogCharacter extends CharacterSeed {
  id: string;
  animeId: string;
}

export function characterId(animeId: string, slug: string): string {
  return `${animeId}-${slug}`;
}

/** Flattened catalog of all curated characters (including disabled anime). */
export function getCatalog(): CatalogCharacter[] {
  const known = new Set(ANIME.map((a) => a.id));
  const out: CatalogCharacter[] = [];
  const seen = new Set<string>();
  for (const set of CHARACTER_SETS) {
    if (!known.has(set.animeId)) {
      throw new Error(`Character set references unknown anime "${set.animeId}"`);
    }
    for (const c of set.characters) {
      const id = characterId(set.animeId, c.slug);
      if (seen.has(id)) throw new Error(`Duplicate character id "${id}"`);
      seen.add(id);
      out.push({ ...c, id, animeId: set.animeId });
    }
  }
  return out;
}
