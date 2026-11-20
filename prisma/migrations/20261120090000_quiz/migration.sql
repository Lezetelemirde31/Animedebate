-- CreateTable
CREATE TABLE "QuizRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dayKey" TEXT,
    "difficulty" TEXT NOT NULL,
    "animeId" TEXT,
    "state" JSONB NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "questions" INTEGER NOT NULL,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizStats" (
    "userId" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "answered" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "dailyPlayed" INTEGER NOT NULL DEFAULT 0,
    "dailyStreak" INTEGER NOT NULL DEFAULT 0,
    "bestDailyStreak" INTEGER NOT NULL DEFAULT 0,
    "lastDailyKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizStats_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "QuizRoom" (
    "code" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "playerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizRoom_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "QuizQueueEntry" (
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedCode" TEXT,

    CONSTRAINT "QuizQueueEntry_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "QuizRun_kind_dayKey_score_idx" ON "QuizRun"("kind", "dayKey", "score");

-- CreateIndex
CREATE INDEX "QuizRun_userId_createdAt_idx" ON "QuizRun"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuizRun_userId_dayKey_key" ON "QuizRun"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "QuizRoom_phase_updatedAt_idx" ON "QuizRoom"("phase", "updatedAt");

-- AddForeignKey
ALTER TABLE "QuizRun" ADD CONSTRAINT "QuizRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizStats" ADD CONSTRAINT "QuizStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

