import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { COIN_REWARDS, awardXp } from "@/lib/gamification";
import {
  MIN_RATING,
  START_RATING,
  eloChange,
  seasonWindow,
  type GameKey,
  type MatchResult,
} from "@/game/platform";

type Tx = Prisma.TransactionClient;

export interface ResultPlayer {
  userId: string;
  result: MatchResult;
  /** In-game score, if the game has one (team score, rounds won…). */
  score?: number | null;
  /** XP to award (0 for none, e.g. a player who walked out). */
  xp: number;
  /** XP/AC reason key (see COIN_REWARDS). */
  reason: string;
}

export interface GameResultInput {
  game: GameKey;
  mode: string;
  /** Ranked matches change ratings; every head-to-head match updates the season record. */
  ranked: boolean;
  /** The game's own id for this match — recording the same refId twice does nothing. */
  refId?: string | null;
  startedAt?: Date | null;
  players: ResultPlayer[];
}

// ─── Seasons ───────────────────────────────────────────────────────────────

const seasonCache = globalThis as unknown as { __aaSeason?: { id: string; number: number; name: string; startsAt: Date; endsAt: Date } };

/** The season running now; created on first use (seasons follow calendar quarters). */
export async function currentSeason(now = new Date()) {
  const cached = seasonCache.__aaSeason;
  if (cached && cached.startsAt <= now && now < cached.endsAt) return cached;
  let season = await prisma.season.findFirst({ where: { startsAt: { lte: now }, endsAt: { gt: now } } });
  if (!season) {
    const { startsAt, endsAt } = seasonWindow(now);
    const last = await prisma.season.findFirst({ orderBy: { number: "desc" } });
    const number = (last?.number ?? 0) + 1;
    try {
      season = await prisma.season.create({ data: { number, name: `Sezon ${number}`, startsAt, endsAt } });
    } catch {
      // Another request created it at the same moment.
      season = await prisma.season.findFirst({ where: { startsAt: { lte: now }, endsAt: { gt: now } } });
    }
  }
  if (!season) throw new Error("No season available");
  seasonCache.__aaSeason = season;
  return season;
}

// ─── Recording results ─────────────────────────────────────────────────────

async function ensureRating(tx: Tx, userId: string, game: string, seasonId: string) {
  return tx.gameRating.upsert({
    where: { userId_game_seasonId: { userId, game, seasonId } },
    create: { userId, game, seasonId, rating: START_RATING, peak: START_RATING },
    update: {},
  });
}

/**
 * Records a finished match in the shared history, updates each player's
 * season record (and rating for ranked head-to-head games), then awards
 * XP and Anime Coins through the shared progression. Idempotent per refId.
 * Returns the history entry id, or null when it was already recorded.
 */
export async function recordGameResult(input: GameResultInput): Promise<string | null> {
  const season = await currentSeason();
  const headToHead = input.players.length === 2;
  const coinsOf = (p: ResultPlayer) => (p.xp > 0 ? COIN_REWARDS[p.reason] ?? Math.floor(p.xp / 2) : 0);

  const matchId = await prisma.$transaction(async (tx) => {
    if (input.refId) {
      const existing = await tx.gameMatch.findUnique({ where: { game_refId: { game: input.game, refId: input.refId } } });
      if (existing) return null;
    }

    // Season record (head-to-head only: solo and bot games don't move the ladder).
    const before = new Map<string, { rating: number; played: number }>();
    if (headToHead) {
      for (const p of input.players) {
        const r = await ensureRating(tx, p.userId, input.game, season.id);
        before.set(p.userId, { rating: r.rating, played: r.played });
      }
    }
    const after = new Map<string, number>();
    if (headToHead) {
      const [a, b] = input.players;
      for (const [me, them] of [
        [a, b],
        [b, a],
      ] as const) {
        const mine = before.get(me.userId)!;
        const theirs = before.get(them.userId)!;
        const delta = input.ranked ? eloChange(mine.rating, theirs.rating, me.result, mine.played) : 0;
        after.set(me.userId, Math.max(MIN_RATING, mine.rating + delta));
      }
      for (const p of input.players) {
        const current = await tx.gameRating.findUnique({
          where: { userId_game_seasonId: { userId: p.userId, game: input.game, seasonId: season.id } },
        });
        if (!current) continue;
        const rating = after.get(p.userId)!;
        const streak = p.result === "WIN" ? current.streak + 1 : 0;
        await tx.gameRating.update({
          where: { userId_game_seasonId: { userId: p.userId, game: input.game, seasonId: season.id } },
          data: {
            rating,
            peak: Math.max(current.peak, rating),
            played: { increment: 1 },
            wins: { increment: p.result === "WIN" ? 1 : 0 },
            losses: { increment: p.result === "LOSS" ? 1 : 0 },
            draws: { increment: p.result === "DRAW" ? 1 : 0 },
            streak,
            bestStreak: Math.max(current.bestStreak, streak),
          },
        });
      }
    }

    const now = new Date();
    const match = await tx.gameMatch.create({
      data: {
        game: input.game,
        mode: input.mode,
        ranked: input.ranked,
        seasonId: season.id,
        refId: input.refId ?? null,
        winnerId: input.players.find((p) => p.result === "WIN")?.userId ?? null,
        startedAt: input.startedAt ?? null,
        endedAt: now,
      },
    });
    for (const p of input.players) {
      await tx.gameMatchPlayer.create({
        data: {
          matchId: match.id,
          userId: p.userId,
          result: p.result,
          score: p.score ?? null,
          ratingBefore: headToHead ? before.get(p.userId)!.rating : null,
          ratingAfter: headToHead ? after.get(p.userId)! : null,
          xp: p.xp,
          coins: coinsOf(p),
          endedAt: now,
        },
      });
    }
    return match.id;
  });

  if (!matchId) return null;
  // Progression runs after the record is committed; a failure here never loses the result.
  for (const p of input.players) {
    if (p.xp <= 0) continue;
    await awardXp({ userId: p.userId, amount: p.xp, reason: p.reason, refType: input.game, refId: matchId, coins: coinsOf(p) }).catch((err) =>
      console.error("[platform] reward failed", err),
    );
  }
  return matchId;
}
