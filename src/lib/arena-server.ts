import "server-only";
import { prisma } from "@/lib/db";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import { isStarterCharacter, STARTER_CHARACTER_IDS, toArenaCard, type ArenaCard } from "@/game/arena";

export interface PlayerArenaPool {
  playableCards: ArenaCard[];
  allCatalogCards: ArenaCard[];
  ownedIds: string[];
  allowedIds: string[];
}

export async function loadPlayerArenaPool(userId: string): Promise<PlayerArenaPool> {
  const [characters, ownedRows] = await Promise.all([
    prisma.character.findMany({
      where: enabledCharacterWhere,
      include: { anime: { select: { name: true, shortName: true } } },
      orderBy: [{ powerLevel: "desc" }, { name: "asc" }],
    }),
    prisma.ownedCharacter.findMany({
      where: { userId },
      select: { characterId: true },
    }),
  ]);

  const ownedSet = new Set(ownedRows.map((row) => row.characterId));
  const allowedSet = new Set<string>([...STARTER_CHARACTER_IDS, ...ownedSet]);

  const allCatalogCards: ArenaCard[] = characters.map((char) => {
    const dto = toCharacterDTO(char);
    const starter = isStarterCharacter(char.id);
    return toArenaCard(dto, { isStarter: starter });
  });

  const playableCards = allCatalogCards.filter((card) => allowedSet.has(card.id));

  return {
    playableCards,
    allCatalogCards,
    ownedIds: allCatalogCards.filter((c) => ownedSet.has(c.id)).map((c) => c.id),
    allowedIds: playableCards.map((c) => c.id),
  };
}
