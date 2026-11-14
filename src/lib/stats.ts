import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { RARITIES, RARITY_INFO } from "@/game/rarity";

export interface PlayerStatsRow {
  id: string;
  username: string;
  avatarStyle: string;
  avatarImage: string | null;
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
  const filter = where?.userId ? Prisma.sql`WHERE u."id" = ${where.userId}` : Prisma.sql`WHERE u."matchesPlayed" > 0 OR o."id" IS NOT NULL`;
  const rows = await prisma.$queryRaw<
    (Omit<PlayerStatsRow, "characters" | "collectionScore"> & { characters: bigint; collectionScore: bigint | null })[]
  >`
    SELECT u."id", u."username", u."avatarStyle", av."imageUrl" AS "avatarImage",
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
