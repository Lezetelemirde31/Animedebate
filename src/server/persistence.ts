/**
 * Database side of the auction engine. Every function here is called from
 * inside a match's AsyncLock, after the move has been validated in memory.
 * Money and ownership changes are written in a transaction with guards so
 * that balances can never go negative and a lot can never be settled twice.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AvatarDTO, RoomSettings } from "@/game/types";
import { generateRoomCode } from "@/game/rules";

export interface PlayerProfile {
  userId: string;
  username: string;
  avatar: AvatarDTO;
}

export interface NewMatchInput {
  hostId: string;
  isPrivate: boolean;
  isMatchmade: boolean;
  settings: RoomSettings;
  /** Users seated immediately, in seat order. */
  playerIds: string[];
}

export interface SettleSoldInput {
  matchId: string;
  lotId: string;
  characterId: string;
  winnerId: string;
  price: number;
  points: number;
  loserIds: string[];
}

export interface FinishInput {
  matchId: string;
  status: "FINISHED" | "ABANDONED";
  winnerId: string | null;
  endReason: string;
  results: { userId: string; result: "WIN" | "LOSS" | "DRAW" }[];
  /** Whether matchesPlayed / matchesWon counters should be updated. */
  countStats: boolean;
}

/** Persistence contract used by the engine (mocked in tests). */
export interface Persistence {
  createMatch(input: NewMatchInput): Promise<{ matchId: string; code: string }>;
  addPlayer(matchId: string, userId: string, seat: number, balance: number): Promise<void>;
  removePlayer(matchId: string, userId: string): Promise<void>;
  setHost(matchId: string, hostId: string | null): Promise<void>;
  markStarted(matchId: string): Promise<void>;
  createLot(matchId: string, lotNumber: number, characterId: string, startingPrice: number): Promise<string>;
  recordBid(lotId: string, userId: string, amount: number): Promise<{ id: string; at: number }>;
  settleSold(input: SettleSoldInput): Promise<void>;
  settleUnsold(lotId: string): Promise<void>;
  cancelLot(lotId: string): Promise<void>;
  finishMatch(input: FinishInput): Promise<void>;
  getProfiles(userIds: string[]): Promise<PlayerProfile[]>;
  getOwnerCounts(userIds: string[]): Promise<Map<string, number>>;
}

function avatarOf(u: { avatarStyle: string; avatarCharacter: { imageUrl: string | null } | null }): AvatarDTO {
  return { style: u.avatarStyle, imageUrl: u.avatarCharacter?.imageUrl ?? null };
}

export const prismaPersistence: Persistence = {
  async createMatch(input) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateRoomCode();
      try {
        const match = await prisma.match.create({
          data: {
            code,
            hostId: input.hostId,
            isPrivate: input.isPrivate,
            isMatchmade: input.isMatchmade,
            totalLots: input.settings.totalLots,
            bidSeconds: input.settings.bidSeconds,
            startingBalance: input.settings.startingBalance,
            minIncrement: input.settings.minIncrement,
            animeIds: input.settings.animeIds,
            players: {
              create: input.playerIds.map((userId, seat) => ({ userId, seat, balance: input.settings.startingBalance })),
            },
          },
        });
        return { matchId: match.id, code };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // code collision
        throw err;
      }
    }
    throw new Error("Could not allocate a unique room code");
  },

  async addPlayer(matchId, userId, seat, balance) {
    await prisma.matchPlayer.create({ data: { matchId, userId, seat, balance } });
  },

  async removePlayer(matchId, userId) {
    await prisma.matchPlayer.deleteMany({ where: { matchId, userId } });
  },

  async setHost(matchId, hostId) {
    await prisma.match.update({ where: { id: matchId }, data: { hostId } });
  },

  async markStarted(matchId) {
    await prisma.match.update({ where: { id: matchId }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  },

  async createLot(matchId, lotNumber, characterId, startingPrice) {
    const lot = await prisma.auctionLot.create({ data: { matchId, lotNumber, characterId, startingPrice } });
    return lot.id;
  },

  async recordBid(lotId, userId, amount) {
    const bid = await prisma.bid.create({ data: { lotId, userId, amount } });
    return { id: bid.id, at: bid.createdAt.getTime() };
  },

  async settleSold({ matchId, lotId, characterId, winnerId, price, points, loserIds }) {
    await prisma.$transaction(async (tx) => {
      const lot = await tx.auctionLot.updateMany({
        where: { id: lotId, status: "ACTIVE" },
        data: { status: "SOLD", winnerId, finalPrice: price, endedAt: new Date() },
      });
      if (lot.count !== 1) throw new Error(`Lot ${lotId} is not active`);
      const debit = await tx.matchPlayer.updateMany({
        where: { matchId, userId: winnerId, balance: { gte: price } },
        data: { balance: { decrement: price }, score: { increment: points } },
      });
      if (debit.count !== 1) throw new Error(`Balance check failed for ${winnerId}`);
      const now = new Date();
      await tx.ownedCharacter.upsert({
        where: { userId_characterId: { userId: winnerId, characterId } },
        create: { userId: winnerId, characterId, lastPrice: price, totalSpent: price, sourceMatchId: matchId },
        update: {
          copies: { increment: 1 },
          lastPrice: price,
          totalSpent: { increment: price },
          lastAcquiredAt: now,
          sourceMatchId: matchId,
        },
      });
      await tx.user.update({
        where: { id: winnerId },
        data: { auctionWins: { increment: 1 }, totalSpent: { increment: price } },
      });
      if (loserIds.length > 0) {
        await tx.user.updateMany({ where: { id: { in: loserIds } }, data: { auctionLosses: { increment: 1 } } });
      }
    });
  },

  async settleUnsold(lotId) {
    await prisma.auctionLot.updateMany({
      where: { id: lotId, status: "ACTIVE" },
      data: { status: "UNSOLD", endedAt: new Date() },
    });
  },

  async cancelLot(lotId) {
    await prisma.auctionLot.updateMany({
      where: { id: lotId, status: "ACTIVE" },
      data: { status: "CANCELLED", endedAt: new Date() },
    });
  },

  async finishMatch({ matchId, status, winnerId, endReason, results, countStats }) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.match.updateMany({
        where: { id: matchId, status: { in: ["WAITING", "IN_PROGRESS"] } },
        data: { status, winnerId, endReason, endedAt: new Date() },
      });
      if (updated.count !== 1) return; // already finished
      await tx.auctionLot.updateMany({
        where: { matchId, status: "ACTIVE" },
        data: { status: "CANCELLED", endedAt: new Date() },
      });
      for (const r of results) {
        await tx.matchPlayer.updateMany({ where: { matchId, userId: r.userId }, data: { result: r.result } });
        if (countStats) {
          await tx.user.update({
            where: { id: r.userId },
            data: { matchesPlayed: { increment: 1 }, matchesWon: { increment: r.result === "WIN" ? 1 : 0 } },
          });
        }
      }
    });
  },

  async getProfiles(userIds) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatarStyle: true, avatarCharacter: { select: { imageUrl: true } } },
    });
    return users.map((u) => ({ userId: u.id, username: u.username, avatar: avatarOf(u) }));
  },

  async getOwnerCounts(userIds) {
    const rows = await prisma.ownedCharacter.groupBy({
      by: ["characterId"],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.characterId, r._count._all]));
  },
};
