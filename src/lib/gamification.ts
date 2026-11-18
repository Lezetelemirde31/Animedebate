import "server-only";
import type { NotificationType } from "@prisma/client";
import { BADGES } from "@/data/badges";
import { prisma } from "@/lib/db";
import { RANKS, rankForLevel } from "@/game/ranks";

export const XP_REWARDS = {
  CREATE_DEBATE: 25,
  CREATE_COMPARISON: 25,
  POST_COMMENT: 10,
  VOTE_COMPARISON: 5,
  RECEIVE_LIKE: 5,
  WIN_AUCTION: 20,
  MATCH_WIN: 60,
  MATCH_PLAY: 20,
} as const;

/**
 * Anime Coins (AC) per XP reason. Reasons not listed earn half their XP in AC.
 * Bot duels pay little so they can't be farmed.
 */
export const COIN_REWARDS: Record<string, number> = {
  WIN_AUCTION: 10,
  MATCH_WIN: 50,
  MATCH_PLAY: 15,
  ARENA_PVP_WIN: 25,
  ARENA_PVP_PLAY: 10,
  ARENA_PVP_FORFEIT_WIN: 15,
  ARENA_BOT_WIN: 3,
  ARENA_BOT_PLAY: 1,
  VERSUS_WIN: 30,
  VERSUS_PLAY: 10,
  VERSUS_FRIENDLY_WIN: 15,
  VERSUS_FRIENDLY_PLAY: 5,
  VERSUS_BOT_WIN: 3,
  VERSUS_BOT_PLAY: 1,
};
/** AC for every level gained. */
export const LEVEL_UP_COINS = 20;
/** AC for every achievement (badge) unlocked. */
export const BADGE_COINS = 50;

/** Adds (or, with a negative amount, removes) Anime Coins and records why. */
export async function awardCoins(input: {
  userId: string;
  amount: number;
  reason: string;
  refType?: string | null;
  refId?: string | null;
}): Promise<void> {
  if (!input.amount) return;
  await prisma.user.update({ where: { id: input.userId }, data: { coins: { increment: input.amount } } });
  await prisma.coinEvent.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      reason: input.reason,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
    },
  });
}

export function levelFromXp(xp: number): number {
  const safe = Math.max(0, Math.floor(xp));
  return Math.floor(Math.sqrt(safe / 50)) + 1;
}

export function xpBoundsForLevel(level: number): { currentLevelXp: number; nextLevelXp: number } {
  const lv = Math.max(1, Math.floor(level));
  const currentLevelXp = 50 * (lv - 1) * (lv - 1);
  const nextLevelXp = 50 * lv * lv;
  return { currentLevelXp, nextLevelXp };
}

export async function notifyUser(input: {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  /** Values for the localized text, see `notificationText`. */
  params?: Record<string, string | number>;
  linkUrl?: string | null;
}): Promise<void> {
  if (input.actorId && input.actorId === input.userId) return;
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        actorId: input.actorId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        params: input.params ?? undefined,
        linkUrl: input.linkUrl ?? null,
      },
    });
  } catch (err) {
    console.error("[notifyUser] failed", err);
  }
}

export async function syncUserBadges(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      debatesCount: true,
      comparisonsCount: true,
      commentsCount: true,
      likesReceived: true,
      level: true,
      auctionWins: true,
      matchesPlayed: true,
      matchesWon: true,
    },
  });
  if (!user) return [];

  let allBadges = await prisma.badge.findMany();
  if (allBadges.length === 0) {
    for (const b of BADGES) {
      await prisma.badge.upsert({ where: { id: b.id }, create: b, update: b });
    }
    allBadges = await prisma.badge.findMany();
  }

  const existing = await prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } });
  const ownedIds = new Set(existing.map((e) => e.badgeId));
  const newlyEarned: string[] = [];

  for (const b of allBadges) {
    if (ownedIds.has(b.id)) continue;
    let current = 0;
    switch (b.ruleType) {
      case "DEBATES_COUNT":
        current = user.debatesCount;
        break;
      case "COMPARISONS_COUNT":
        current = user.comparisonsCount;
        break;
      case "COMMENTS_COUNT":
        current = user.commentsCount;
        break;
      case "LIKES_RECEIVED":
        current = user.likesReceived;
        break;
      case "LEVEL_REACHED":
        current = user.level;
        break;
      case "AUCTION_WINS":
        current = user.auctionWins;
        break;
      case "MATCHES_PLAYED":
        current = user.matchesPlayed;
        break;
      case "MATCHES_WON":
        current = user.matchesWon;
        break;
    }
    if (current >= b.threshold) {
      const created = await prisma.userBadge.create({ data: { userId, badgeId: b.id } }).catch(() => null);
      if (!created) continue;
      newlyEarned.push(b.name);
      await awardCoins({ userId, amount: BADGE_COINS, reason: "BADGE_EARNED", refType: "badge", refId: b.slug });
      await notifyUser({
        userId,
        type: "BADGE_EARNED",
        title: `Badge Unlocked: ${b.name}`,
        message: b.description,
        params: { badge: b.slug, name: b.name, description: b.description },
        linkUrl: `/profile`,
      });
    }
  }
  return newlyEarned;
}

export async function awardXp(input: {
  userId: string;
  amount: number;
  reason: string;
  refType?: string;
  refId?: string;
  /** Anime Coins to grant with it; defaults to COIN_REWARDS[reason] or half the XP. */
  coins?: number;
}): Promise<{ xp: number; level: number; leveledUp: boolean }> {
  if (input.amount <= 0) {
    const u = await prisma.user.findUnique({ where: { id: input.userId }, select: { xp: true, level: true } });
    return { xp: u?.xp ?? 0, level: u?.level ?? 1, leveledUp: false };
  }

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { xp: { increment: input.amount } },
    select: { xp: true, level: true },
  });

  const nextLevel = levelFromXp(updated.xp);
  const leveledUp = nextLevel > updated.level;
  const coins = input.coins ?? COIN_REWARDS[input.reason] ?? Math.floor(input.amount / 2);
  await awardCoins({ userId: input.userId, amount: coins, reason: input.reason, refType: input.refType, refId: input.refId });

  if (leveledUp) {
    await prisma.user.update({ where: { id: input.userId }, data: { level: nextLevel } });
    await notifyUser({
      userId: input.userId,
      type: "LEVEL_UP",
      title: `Level ${nextLevel} Reached!`,
      message: `You earned enough XP to advance to Level ${nextLevel}.`,
      params: { level: nextLevel },
      linkUrl: "/profile",
    });
    await awardCoins({
      userId: input.userId,
      amount: LEVEL_UP_COINS * (nextLevel - updated.level),
      reason: "LEVEL_UP",
      refType: "level",
      refId: String(nextLevel),
    });
    const before = rankForLevel(updated.level);
    const after = rankForLevel(nextLevel);
    if (after.tier > before.tier) {
      await notifyUser({
        userId: input.userId,
        type: "RANK_UP",
        title: `New rank: ${after.name.en}`,
        message: `You reached the ${after.name.en} rank.`,
        params: { rank: after.id },
        linkUrl: "/ranks",
      });
      // Every rank passed on the way pays its bonus once.
      for (const r of RANKS.filter((x) => x.tier > before.tier && x.tier <= after.tier)) {
        await awardCoins({ userId: input.userId, amount: r.coinBonus, reason: "RANK_UP", refType: "rank", refId: r.id });
      }
    }
  }

  await prisma.xpEvent.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      reason: input.reason,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
    },
  });

  await syncUserBadges(input.userId);
  return { xp: updated.xp, level: nextLevel, leveledUp };
}
