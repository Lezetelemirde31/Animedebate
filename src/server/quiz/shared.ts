import { prisma } from "@/lib/db";
import { getCatalog } from "../catalog";
import { currentSeason } from "../platform/results";
import type { QuizCharacter } from "./questions";

/** Playable characters with the data the generated questions use. */
export async function quizCharacters(): Promise<QuizCharacter[]> {
  const catalog = await getCatalog();
  return catalog
    .all()
    .map((c) => ({ id: c.id, name: c.name, animeId: c.animeId, rarity: c.rarity, abilities: c.abilities }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function quizRating(userId: string): Promise<number> {
  const season = await currentSeason();
  const r = await prisma.gameRating.findUnique({ where: { userId_game_seasonId: { userId, game: "QUIZ", seasonId: season.id } } });
  return r?.rating ?? 1000;
}
