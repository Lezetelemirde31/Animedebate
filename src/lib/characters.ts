import type { Anime, Character } from "@prisma/client";
import type { CharacterDTO } from "@/game/types";
import { getCharacterScaling } from "@/data/characters";

export type CharacterWithAnime = Character & { anime: Pick<Anime, "name" | "shortName"> };

export function toCharacterDTO(c: CharacterWithAnime): CharacterDTO {
  const scaling = getCharacterScaling(c.id);
  return {
    id: c.id,
    name: c.name,
    title: c.title,
    animeId: c.animeId,
    animeName: c.anime.shortName,
    imageUrl: c.imageUrl,
    description: c.description,
    abilities: c.abilities,
    rarity: c.rarity,
    powerLevel: c.powerLevel,
    primeForm: scaling?.primeForm,
    tierCode: scaling?.tierCode,
  };
}

/** Prisma filter for characters that are currently playable. */
export const enabledCharacterWhere = { enabled: true, anime: { enabled: true } } as const;
