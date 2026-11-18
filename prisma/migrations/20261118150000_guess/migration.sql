-- CreateTable
CREATE TABLE "GuessRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dayKey" TEXT,
    "mode" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "animeId" TEXT,
    "state" JSONB NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "rounds" INTEGER NOT NULL,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuessRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuessStats" (
    "userId" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "roundsPlayed" INTEGER NOT NULL DEFAULT 0,
    "roundsCorrect" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "dailyPlayed" INTEGER NOT NULL DEFAULT 0,
    "dailyStreak" INTEGER NOT NULL DEFAULT 0,
    "bestDailyStreak" INTEGER NOT NULL DEFAULT 0,
    "lastDailyKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuessStats_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GuessRoom" (
    "code" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "playerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuessRoom_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "GuessQueueEntry" (
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedCode" TEXT,

    CONSTRAINT "GuessQueueEntry_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "GuessRun_kind_dayKey_score_idx" ON "GuessRun"("kind", "dayKey", "score");

-- CreateIndex
CREATE INDEX "GuessRun_userId_createdAt_idx" ON "GuessRun"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuessRun_userId_dayKey_key" ON "GuessRun"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "GuessRoom_phase_updatedAt_idx" ON "GuessRoom"("phase", "updatedAt");

-- AddForeignKey
ALTER TABLE "GuessRun" ADD CONSTRAINT "GuessRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuessStats" ADD CONSTRAINT "GuessStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

