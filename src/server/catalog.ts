import { prisma } from "@/lib/db";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import type { Rarity } from "@/game/rarity";
import type { CharacterDTO } from "@/game/types";

/** In-memory cache of playable characters, loaded on demand. */
export class CharacterCatalog {
  private byId = new Map<string, CharacterDTO>();

  async load(): Promise<void> {
    const rows = await prisma.character.findMany({
      where: enabledCharacterWhere,
      include: { anime: { select: { name: true, shortName: true } } },
    });
    this.byId = new Map(rows.map((r) => [r.id, toCharacterDTO(r)]));
  }

  get(id: string): CharacterDTO | undefined {
    return this.byId.get(id);
  }

  rarity(id: string): Rarity | undefined {
    return this.byId.get(id)?.rarity;
  }

  all(): CharacterDTO[] {
    return [...this.byId.values()];
  }

  idsForAnime(animeIds: string[]): string[] {
    const set = new Set(animeIds);
    return [...this.byId.values()].filter((c) => set.has(c.animeId)).map((c) => c.id);
  }

  get size(): number {
    return this.byId.size;
  }

  set(chars: CharacterDTO[]): void {
    this.byId = new Map(chars.map((c) => [c.id, c]));
  }
}

export type Catalog = CharacterCatalog;

const CATALOG_TTL_MS = 60_000;

const g = globalThis as unknown as {
  __aaCatalog?: CharacterCatalog;
  __aaCatalogLoadedAt?: number;
  __aaCatalogPromise?: Promise<CharacterCatalog> | null;
};

/** Returns a cached CharacterCatalog, refreshing periodically or when empty. */
export async function getCatalog(): Promise<CharacterCatalog> {
  const now = Date.now();
  if (g.__aaCatalog && g.__aaCatalog.size > 0 && g.__aaCatalogLoadedAt && now - g.__aaCatalogLoadedAt < CATALOG_TTL_MS) {
    return g.__aaCatalog;
  }
  if (g.__aaCatalogPromise) return g.__aaCatalogPromise;
  g.__aaCatalogPromise = (async () => {
    const catalog = g.__aaCatalog ?? new CharacterCatalog();
    await catalog.load();
    g.__aaCatalog = catalog;
    g.__aaCatalogLoadedAt = Date.now();
    return catalog;
  })().finally(() => {
    g.__aaCatalogPromise = null;
  });
  return g.__aaCatalogPromise;
}
