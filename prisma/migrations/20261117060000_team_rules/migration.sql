-- Team auction rules: alternating forced openings, skips and free characters
-- for players who ran out of money.
ALTER TABLE "AuctionLot" ADD COLUMN "forcedOpenerId" TEXT;
ALTER TABLE "AuctionLot" ADD COLUMN "skipped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AuctionLot" ADD COLUMN "autoAssigned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AuctionLot" ADD COLUMN "skipVotes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Match" ADD COLUMN "nextOpenerId" TEXT;
