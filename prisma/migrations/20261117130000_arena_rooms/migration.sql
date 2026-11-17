-- Arena rooms move from server memory to the database so they work on
-- serverless hosting (Vercel), where requests reach different instances.
CREATE TABLE "ArenaRoom" (
    "code" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "playerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArenaRoom_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "ArenaRoom_phase_updatedAt_idx" ON "ArenaRoom"("phase", "updatedAt");
