import type { Locale } from "@/lib/i18n";

/**
 * The platform's games. Every game records its results through the shared
 * match history and keeps its own rating per season.
 *
 * Only games that are fully playable are listed (`GAMES`); new games are added
 * here when they ship.
 */
export type GameKey = "AUCTION" | "CARD_DUEL";

export interface GameInfo {
  key: GameKey;
  href: string;
  name: Record<Locale, string>;
  tagline: Record<Locale, string>;
  description: Record<Locale, string>;
  /** Modes as shown to players. */
  modes: Record<Locale, string[]>;
  /** Whether matches of this game can change ratings. */
  hasRanked: boolean;
  color: string;
}

export const GAMES: readonly GameInfo[] = [
  {
    key: "CARD_DUEL",
    href: "/arena",
    name: { tr: "Kart Düellosu", en: "Card Duel" },
    tagline: { tr: "Taktiksel counter-pick kart savaşı", en: "Tactical counter-pick card battle" },
    description: {
      tr: "5 kartlık desteni kur, rakibin açılış kartına karşı doğru rolü seç ve turları çevir. İlk 3 turu kazanan düelloyu alır.",
      en: "Build a 5-card deck, answer your opponent's opening card with the right role and turn the rounds. First to 3 wins.",
    },
    modes: { tr: ["Bota karşı", "Oyuncuya karşı (oda)"], en: ["Versus bot", "Versus player (room)"] },
    hasRanked: false,
    color: "#a855f7",
  },
  {
    key: "AUCTION",
    href: "/play",
    name: { tr: "Anime Açık Artırma", en: "Anime Auction" },
    tagline: { tr: "$20 ile 5 kişilik en güçlü takımı kur", en: "Build the strongest team of 5 with $20" },
    description: {
      tr: "Rakibinle aynı karakterler için canlı teklif ver. Sırayla açılış, atlama ve gizli güçlerle en yüksek takım skorunu topla.",
      en: "Bid live against your opponent for the same characters. Alternating openings, skips and hidden power — reach the best team score.",
    },
    modes: { tr: ["Hızlı eşleşme (dereceli)", "Özel / açık oda"], en: ["Quick match (ranked)", "Private / public room"] },
    hasRanked: true,
    color: "#f43f5e",
  },
];

export const GAME_KEYS = GAMES.map((g) => g.key);

export function gameInfo(key: string): GameInfo | undefined {
  return GAMES.find((g) => g.key === key);
}

export function isGameKey(key: unknown): key is GameKey {
  return typeof key === "string" && GAME_KEYS.includes(key as GameKey);
}

// ─── Ratings ───────────────────────────────────────────────────────────────

export const START_RATING = 1000;
export const MIN_RATING = 100;
/** Placement: the first matches move the rating faster. */
export const PLACEMENT_MATCHES = 10;

export type MatchResult = "WIN" | "LOSS" | "DRAW";

/** Elo update for one player against one opponent. */
export function eloChange(rating: number, opponent: number, result: MatchResult, played: number): number {
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  const actual = result === "WIN" ? 1 : result === "DRAW" ? 0.5 : 0;
  const k = played < PLACEMENT_MATCHES ? 48 : rating >= 2000 ? 24 : 32;
  return Math.round(k * (actual - expected));
}

/** Rating tier names shown on game ladders. */
export const LEAGUES = [
  { min: 0, name: { tr: "Bronz", en: "Bronze" }, color: "#b45309" },
  { min: 1100, name: { tr: "Gümüş", en: "Silver" }, color: "#94a3b8" },
  { min: 1250, name: { tr: "Altın", en: "Gold" }, color: "#f59e0b" },
  { min: 1400, name: { tr: "Platin", en: "Platinum" }, color: "#22d3ee" },
  { min: 1600, name: { tr: "Elmas", en: "Diamond" }, color: "#818cf8" },
  { min: 1800, name: { tr: "Usta", en: "Master" }, color: "#e879f9" },
  { min: 2000, name: { tr: "Efsane", en: "Legend" }, color: "#f43f5e" },
] as const;

export function leagueFor(rating: number) {
  let current: (typeof LEAGUES)[number] = LEAGUES[0];
  for (const l of LEAGUES) if (rating >= l.min) current = l;
  return current;
}

// ─── Seasons ───────────────────────────────────────────────────────────────

/** Seasons follow calendar quarters (UTC): Q1 = season of Jan–Mar, etc. */
export function seasonWindow(at: Date): { startsAt: Date; endsAt: Date; year: number; quarter: number } {
  const year = at.getUTCFullYear();
  const quarter = Math.floor(at.getUTCMonth() / 3);
  return {
    startsAt: new Date(Date.UTC(year, quarter * 3, 1)),
    endsAt: new Date(Date.UTC(year, quarter * 3 + 3, 1)),
    year,
    quarter: quarter + 1,
  };
}
