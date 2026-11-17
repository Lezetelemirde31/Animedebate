import "server-only";
import type { Rarity } from "@prisma/client";
import { ENABLED_ANIME } from "@/data/anime";
import { shuffle } from "@/game/rules";
import { enabledCharacterWhere } from "@/lib/characters";
import { prisma } from "@/lib/db";

export interface AuthShowcaseCharacter {
  id: string;
  name: string;
  animeId: string;
  animeName: string;
  imageUrl: string | null;
  rarity: Rarity;
}

export interface AuthPageData {
  featuredCharacters: AuthShowcaseCharacter[];
  totalCharacters: number;
  animeCount: number;
}

export async function getAuthPageData(): Promise<AuthPageData> {
  const [featuredRows, totalCharacters] = await Promise.all([
    prisma.character.findMany({
      where: {
        ...enabledCharacterWhere,
        rarity: { in: ["MYTHIC", "LEGENDARY"] },
        imageUrl: { not: null },
      },
      include: { anime: { select: { shortName: true } } },
    }),
    prisma.character.count({ where: enabledCharacterWhere }),
  ]);

  const featuredCharacters: AuthShowcaseCharacter[] = shuffle(featuredRows)
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      name: c.name,
      animeId: c.animeId,
      animeName: c.anime.shortName,
      imageUrl: c.imageUrl,
      rarity: c.rarity as Rarity,
    }));

  return {
    featuredCharacters,
    totalCharacters,
    animeCount: ENABLED_ANIME.length,
  };
}
