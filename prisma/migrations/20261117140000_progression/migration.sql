-- Progression: ranks (derived from level), Anime Coins and match achievements.
ALTER TYPE "NotificationType" ADD VALUE 'RANK_UP';
ALTER TYPE "BadgeRuleType" ADD VALUE 'MATCHES_PLAYED';
ALTER TYPE "BadgeRuleType" ADD VALUE 'MATCHES_WON';

ALTER TABLE "User" ADD COLUMN "coins" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CoinEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoinEvent_userId_createdAt_idx" ON "CoinEvent"("userId", "createdAt");

ALTER TABLE "CoinEvent" ADD CONSTRAINT "CoinEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
