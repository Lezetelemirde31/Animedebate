import type { Anime, Character } from "@prisma/client";
import type { CharacterDTO } from "@/game/types";

export type CharacterWithAnime = Character & { anime: Pick<Anime, "name" | "shortName"> };

export function toCharacterDTO(c: CharacterWithAnime): CharacterDTO {
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
  };
}

/** Prisma filter for characters that are currently playable. */
export const enabledCharacterWhere = { enabled: true, anime: { enabled: true } } as const;
