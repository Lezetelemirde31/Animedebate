import { prisma } from "@/lib/db";
import { GAMES, type GameKey } from "@/game/platform";
import { currentSeason } from "./results";

const userCard = {
  select: { username: true, avatarStyle: true, avatarCustomUrl: true, avatarCharacter: { select: { imageUrl: true } }, level: true },
} as const;

type UserCardRow = {
  username: string;
  avatarStyle: string;
  avatarCustomUrl: string | null;
  avatarCharacter: { imageUrl: string | null } | null;
  level: number;
};
const avatarOf = (u: UserCardRow) => u.avatarCustomUrl ?? u.avatarCharacter?.imageUrl ?? null;

export interface LadderRow {
  userId: string;
  username: string;
  avatarStyle: string;
  avatarImage: string | null;
  level: number;
  rating: number;
  peak: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  bestStreak: number;
}

/** Season ladder of one game: everyone with at least one head-to-head match. */
export async function getLadder(game: GameKey, limit = 100): Promise<{ season: Awaited<ReturnType<typeof currentSeason>>; rows: LadderRow[] }> {
  const season = await currentSeason();
  const rows = await prisma.gameRating.findMany({
    where: { game, seasonId: season.id, played: { gt: 0 } },
    orderBy: [{ rating: "desc" }, { wins: "desc" }],
    take: limit,
    include: { user: userCard },
  });
  return {
    season,
    rows: rows.map((r) => ({
      userId: r.userId,
      username: r.user.username,
      avatarStyle: r.user.avatarStyle,
      avatarImage: avatarOf(r.user),
      level: r.user.level,
      rating: r.rating,
      peak: r.peak,
      played: r.played,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      bestStreak: r.bestStreak,
    })),
  };
}

export interface PlayerGameSummary {
  game: GameKey;
  season: { rating: number; peak: number; played: number; wins: number; losses: number; draws: number; streak: number; bestStreak: number; position: number | null } | null;
  lifetime: { played: number; wins: number; losses: number; draws: number };
}

/** Per-game season record (with ladder position) and lifetime totals for one player. */
export async function getPlayerGameSummaries(userId: string): Promise<PlayerGameSummary[]> {
  const season = await currentSeason();
  const [ratings, history] = await Promise.all([
    prisma.gameRating.findMany({ where: { userId, seasonId: season.id } }),
    prisma.gameMatchPlayer.findMany({ where: { userId }, select: { result: true, match: { select: { game: true } } } }),
  ]);
  const out: PlayerGameSummary[] = [];
  for (const g of GAMES) {
    const r = ratings.find((x) => x.game === g.key && x.played > 0);
    const mine = history.filter((h) => h.match.game === g.key);
    let position: number | null = null;
    if (r) {
      position =
        (await prisma.gameRating.count({ where: { game: g.key, seasonId: season.id, played: { gt: 0 }, rating: { gt: r.rating } } })) + 1;
    }
    out.push({
      game: g.key,
      season: r
        ? {
            rating: r.rating,
            peak: r.peak,
            played: r.played,
            wins: r.wins,
            losses: r.losses,
            draws: r.draws,
            streak: r.streak,
            bestStreak: r.bestStreak,
            position,
          }
        : null,
      lifetime: {
        played: mine.length,
        wins: mine.filter((h) => h.result === "WIN").length,
        losses: mine.filter((h) => h.result === "LOSS").length,
        draws: mine.filter((h) => h.result === "DRAW").length,
      },
    });
  }
  return out;
}

export interface RecentMatch {
  id: string;
  game: string;
  mode: string;
  ranked: boolean;
  result: string;
  score: number | null;
  ratingDelta: number | null;
  xp: number;
  coins: number;
  endedAt: Date;
  opponents: { username: string }[];
}

/** A player's latest matches across all games. */
export async function getRecentMatches(userId: string, take = 10): Promise<RecentMatch[]> {
  const rows = await prisma.gameMatchPlayer.findMany({
    where: { userId },
    orderBy: { endedAt: "desc" },
    take,
    include: { match: { include: { players: { include: { user: { select: { username: true } } } } } } },
  });
  return rows.map((r) => ({
    id: r.matchId,
    game: r.match.game,
    mode: r.match.mode,
    ranked: r.match.ranked,
    result: r.result,
    score: r.score,
    ratingDelta: r.ratingBefore !== null && r.ratingAfter !== null ? r.ratingAfter - r.ratingBefore : null,
    xp: r.xp,
    coins: r.coins,
    endedAt: r.endedAt,
    opponents: r.match.players.filter((p) => p.userId !== userId).map((p) => ({ username: p.user.username })),
  }));
}

/** Matches played this season, per game (for the games hub). */
export async function getSeasonActivity(): Promise<Record<string, number>> {
  const season = await currentSeason();
  const out: Record<string, number> = {};
  for (const g of GAMES) out[g.key] = await prisma.gameMatch.count({ where: { game: g.key, seasonId: season.id } });
  return out;
}
