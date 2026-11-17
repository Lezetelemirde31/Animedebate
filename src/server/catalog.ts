import { prisma } from "@/lib/db";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import type { CharacterDTO } from "@/game/types";

/** In-memory cache of playable characters, loaded at boot. */
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
