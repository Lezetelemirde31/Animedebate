-- CreateEnum
CREATE TYPE "MatchPhase" AS ENUM ('LOBBY', 'COUNTDOWN', 'BIDDING', 'INTERMISSION', 'PAUSED', 'FINISHED', 'ABANDONED');

-- AlterTable
ALTER TABLE "AuctionLot" ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "highestBid" INTEGER,
ADD COLUMN     "highestBidderId" TEXT;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "lotsCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pausedPhase" "MatchPhase",
ADD COLUMN     "pausedRemainingMs" INTEGER,
ADD COLUMN     "phase" "MatchPhase" NOT NULL DEFAULT 'LOBBY',
ADD COLUMN     "phaseEndsAt" TIMESTAMP(3),
ADD COLUMN     "pool" TEXT[],
ADD COLUMN     "rematchCode" TEXT,
ADD COLUMN     "rematchVotes" TEXT[],
ADD COLUMN     "resultDetail" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MatchPlayer" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "ready" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MatchSpectator" (
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSpectator_pkey" PRIMARY KEY ("matchId","userId")
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "userId" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedCode" TEXT,

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "MatchSpectator" ADD CONSTRAINT "MatchSpectator_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSpectator" ADD CONSTRAINT "MatchSpectator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: matches that were live under the previous in-memory engine cannot be resumed.
UPDATE "AuctionLot" SET "status" = 'CANCELLED', "endedAt" = NOW() WHERE "status" = 'ACTIVE';
UPDATE "Match" SET "status" = 'ABANDONED', "phase" = 'ABANDONED', "endReason" = 'ABANDONED', "endedAt" = NOW()
  WHERE "status" = 'IN_PROGRESS';
UPDATE "Match" SET "phase" = 'FINISHED' WHERE "status" = 'FINISHED';
UPDATE "Match" SET "phase" = 'ABANDONED' WHERE "status" = 'ABANDONED';
