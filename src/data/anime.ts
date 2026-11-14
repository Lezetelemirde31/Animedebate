/**
 * Anime registry.
 *
 * To add a new anime later:
 *   1. Add an entry below (keep `enabled: false` until it is ready).
 *   2. Create `src/data/characters/<id>.ts` and register it in `src/data/characters/index.ts`.
 *   3. Run `npm run images:fetch` (optional) and `npm run db:seed`.
 *
 * Only anime with `enabled: true` are shown on the site and used in auction pools.
 */
export interface AnimeDefinition {
  id: string;
  name: string;
  shortName: string;
  /** Accent colour used for badges and card art. */
  color: string;
  description: string;
  enabled: boolean;
  sortOrder: number;
  /** Title fragments used to verify artwork lookups (lower-case). */
  mediaKeywords: string[];
}

export const ANIME: AnimeDefinition[] = [
  {
    id: "naruto",
    name: "Naruto",
    shortName: "Naruto",
    color: "#fb923c",
    description: "Shinobi of the Hidden Villages, from Team 7 to the Fourth Great Ninja War.",
    enabled: true,
    sortOrder: 1,
    mediaKeywords: ["naruto"],
  },
  {
    id: "boruto",
    name: "Boruto: Naruto Next Generations",
    shortName: "Boruto",
    color: "#22d3ee",
    description: "The next generation of the Hidden Leaf faces Kara and the Ōtsutsuki clan.",
    enabled: true,
    sortOrder: 2,
    mediaKeywords: ["boruto"],
  },
  {
    id: "one-piece",
    name: "One Piece",
    shortName: "One Piece",
    color: "#f87171",
    description: "Pirates, Emperors and Admirals racing across the Grand Line for the One Piece.",
    enabled: true,
    sortOrder: 3,
    mediaKeywords: ["one piece"],
  },
  {
    id: "black-clover",
    name: "Black Clover",
    shortName: "Black Clover",
    color: "#4ade80",
    description: "Magic Knights of the Clover Kingdom chasing the title of Wizard King.",
    enabled: true,
    sortOrder: 4,
    mediaKeywords: ["black clover"],
  },
  {
    id: "bleach",
    name: "Bleach",
    shortName: "Bleach",
    color: "#60a5fa",
    description: "Soul Reapers, Arrancar and Quincy clashing between the worlds of the living and the dead.",
    enabled: true,
    sortOrder: 5,
    mediaKeywords: ["bleach"],
  },
  {
    id: "tokyo-revengers",
    name: "Tokyo Revengers",
    shortName: "Tokyo Revengers",
    color: "#facc15",
    description: "Delinquent gangs of Tokyo and a time-leaper trying to rewrite the future of Toman.",
    enabled: true,
    sortOrder: 6,
    mediaKeywords: ["tokyo revengers", "tokyo卍revengers", "tokyo manji revengers"],
  },
];

export const ENABLED_ANIME = ANIME.filter((a) => a.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
export const ENABLED_ANIME_IDS = ENABLED_ANIME.map((a) => a.id);

const byId = new Map(ANIME.map((a) => [a.id, a]));

export function getAnime(id: string): AnimeDefinition | undefined {
  return byId.get(id);
}

export function isEnabledAnime(id: string): boolean {
  return byId.get(id)?.enabled === true;
}
