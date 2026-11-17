import "server-only";
import type { NotificationType } from "@prisma/client";
import { BADGES } from "@/data/badges";
import { prisma } from "@/lib/db";

export const XP_REWARDS = {
  CREATE_DEBATE: 25,
  CREATE_COMPARISON: 25,
  POST_COMMENT: 10,
  VOTE_COMPARISON: 5,
  RECEIVE_LIKE: 5,
  WIN_AUCTION: 20,
} as const;

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
    }
    if (current >= b.threshold) {
      await prisma.userBadge.create({ data: { userId, badgeId: b.id } }).catch(() => null);
      newlyEarned.push(b.name);
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
