import { prisma } from "@/lib/db";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import type { CharacterDTO } from "@/game/types";
import type { Rarity } from "@/game/rarity";

const TTL_MS = 5 * 60_000;

export interface Catalog {
  get(id: string): CharacterDTO | undefined;
  rarity(id: string): Rarity | undefined;
  idsForAnime(animeIds: string[]): string[];
  size: number;
}

export function makeCatalog(chars: CharacterDTO[]): Catalog {
  const byId = new Map(chars.map((c) => [c.id, c]));
  return {
    get: (id) => byId.get(id),
    rarity: (id) => byId.get(id)?.rarity,
    idsForAnime(animeIds) {
      const set = new Set(animeIds);
      return chars.filter((c) => set.has(c.animeId)).map((c) => c.id);
    },
    size: byId.size,
  };
}

const store = globalThis as unknown as { __aaCatalog?: { at: number; catalog: Catalog } };

/** Playable characters, cached per server instance (works in serverless functions too). */
export async function getCatalog(): Promise<Catalog> {
  const hit = store.__aaCatalog;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.catalog;
  const rows = await prisma.character.findMany({
    where: enabledCharacterWhere,
    include: { anime: { select: { name: true, shortName: true } } },
  });
  const catalog = makeCatalog(rows.map(toCharacterDTO));
  store.__aaCatalog = { at: Date.now(), catalog };
  return catalog;
}

export function resetCatalogCache(): void {
  store.__aaCatalog = undefined;
}
