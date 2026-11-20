-- Anime 1v1: matches and the ranked matchmaking queue.

-- CreateTable
CREATE TABLE "VersusMatch" (
    "code" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "playerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VersusMatch_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "VersusQueueEntry" (
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedCode" TEXT,

    CONSTRAINT "VersusQueueEntry_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "VersusMatch_phase_updatedAt_idx" ON "VersusMatch"("phase", "updatedAt");

