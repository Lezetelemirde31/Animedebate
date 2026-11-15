import { Prisma } from "@prisma/client";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { RARITIES, RARITY_INFO } from "@/game/rarity";

export interface PlayerStatsRow {
  id: string;
  username: string;
  avatarStyle: string;
  avatarImage: string | null;
  xp: number;
  level: number;
  debatesCount: number;
  comparisonsCount: number;
  commentsCount: number;
  likesReceived: number;
  auctionWins: number;
  auctionLosses: number;
  matchesPlayed: number;
  matchesWon: number;
  totalSpent: number;
  characters: number;
  collectionScore: number;
}

// CASE expression built from constants (never user input).
const pointsCase = Prisma.raw(
  `CASE ch."rarity" ${RARITIES.map((r) => `WHEN '${r}' THEN ${RARITY_INFO[r].points}`).join(" ")} ELSE 0 END`,
);

/** Aggregated player stats, used by the leaderboard and profiles. */
export async function getPlayerStats(where?: { userId?: string }): Promise<PlayerStatsRow[]> {
  if (!isDatabaseConfigured()) {
    const users = await prisma.user.findMany({
      where: where?.userId ? { id: where.userId } : { isBanned: false },
      include: { avatarCharacter: { select: { imageUrl: true } } },
    });
    const owned = await prisma.ownedCharacter.findMany({
      where: where?.userId ? { userId: where.userId } : undefined,
      include: { character: { select: { rarity: true } } },
    });
    return users.map((u) => {
      const mine = owned.filter((o) => o.userId === u.id);
      const collectionScore = mine.reduce((s, o) => s + RARITY_INFO[o.character.rarity].points, 0);
      return {
        id: u.id,
        username: u.username,
        avatarStyle: u.avatarStyle,
        avatarImage: u.avatarCustomUrl ?? u.avatarCharacter?.imageUrl ?? null,
        xp: u.xp,
        level: u.level,
        debatesCount: u.debatesCount,
        comparisonsCount: u.comparisonsCount,
        commentsCount: u.commentsCount,
        likesReceived: u.likesReceived,
        auctionWins: u.auctionWins,
        auctionLosses: u.auctionLosses,
        matchesPlayed: u.matchesPlayed,
        matchesWon: u.matchesWon,
        totalSpent: u.totalSpent,
        characters: mine.length,
        collectionScore,
      };
    });
  }

  const filter = where?.userId
    ? Prisma.sql`WHERE u."id" = ${where.userId}`
    : Prisma.sql`WHERE u."isBanned" = false AND (u."matchesPlayed" > 0 OR o."id" IS NOT NULL OR u."xp" > 0)`;
  const rows = await prisma.$queryRaw<
    (Omit<PlayerStatsRow, "characters" | "collectionScore"> & { characters: bigint; collectionScore: bigint | null })[]
  >`
    SELECT u."id", u."username", u."avatarStyle",
           COALESCE(u."avatarCustomUrl", av."imageUrl") AS "avatarImage",
           u."xp", u."level", u."debatesCount", u."comparisonsCount", u."commentsCount", u."likesReceived",
           u."auctionWins", u."auctionLosses", u."matchesPlayed", u."matchesWon", u."totalSpent",
           COUNT(o."id") AS "characters",
           COALESCE(SUM(${pointsCase}), 0) AS "collectionScore"
    FROM "User" u
    LEFT JOIN "OwnedCharacter" o ON o."userId" = u."id"
    LEFT JOIN "Character" ch ON ch."id" = o."characterId"
    LEFT JOIN "Character" av ON av."id" = u."avatarCharacterId"
    ${filter}
    GROUP BY u."id", av."imageUrl"
  `;
  return rows.map((r) => ({ ...r, characters: Number(r.characters), collectionScore: Number(r.collectionScore ?? 0) }));
}

export function winRate(wins: number, losses: number): number | null {
  const total = wins + losses;
  return total === 0 ? null : wins / total;
}
