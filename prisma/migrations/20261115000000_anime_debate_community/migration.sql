-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');
CREATE TYPE "DebateCategory" AS ENUM ('GENERAL', 'POWER_SCALING', 'LORE', 'HOT_TAKE');
CREATE TYPE "ContentStatus" AS ENUM ('OPEN', 'LOCKED', 'HIDDEN');
CREATE TYPE "ComparisonCriteria" AS ENUM ('OVERALL', 'COMBAT', 'WRITING', 'INTELLIGENCE');
CREATE TYPE "ComparisonSide" AS ENUM ('A', 'B');
CREATE TYPE "NotificationType" AS ENUM ('COMMENT_ON_DEBATE', 'COMMENT_ON_COMPARISON', 'COMMENT_REPLY', 'REACTION_MILESTONE', 'BADGE_EARNED', 'LEVEL_UP', 'MODERATION');
CREATE TYPE "BadgeRuleType" AS ENUM ('DEBATES_COUNT', 'COMPARISONS_COUNT', 'COMMENTS_COUNT', 'LIKES_RECEIVED', 'LEVEL_REACHED', 'AUCTION_WINS');

-- AlterTable User
ALTER TABLE "User"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "avatarCustomUrl" TEXT,
  ADD COLUMN "xp" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "debatesCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "comparisonsCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commentsCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "likesReceived" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isBanned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bannedReason" TEXT,
  ADD COLUMN "usernameChangedAt" TIMESTAMP(3);

CREATE INDEX "User_xp_idx" ON "User"("xp");
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateTable Debate
CREATE TABLE "Debate" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "animeId" TEXT,
  "characterId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" "DebateCategory" NOT NULL DEFAULT 'GENERAL',
  "status" "ContentStatus" NOT NULL DEFAULT 'OPEN',
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "likesCount" INTEGER NOT NULL DEFAULT 0,
  "dislikesCount" INTEGER NOT NULL DEFAULT 0,
  "commentsCount" INTEGER NOT NULL DEFAULT 0,
  "viewsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Debate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Debate_slug_key" ON "Debate"("slug");
CREATE INDEX "Debate_status_isPinned_createdAt_idx" ON "Debate"("status", "isPinned", "createdAt");
CREATE INDEX "Debate_authorId_idx" ON "Debate"("authorId");
CREATE INDEX "Debate_animeId_idx" ON "Debate"("animeId");
CREATE INDEX "Debate_characterId_idx" ON "Debate"("characterId");

-- CreateTable CharacterComparison
CREATE TABLE "CharacterComparison" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "characterAId" TEXT NOT NULL,
  "characterBId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "criteria" "ComparisonCriteria" NOT NULL DEFAULT 'OVERALL',
  "status" "ContentStatus" NOT NULL DEFAULT 'OPEN',
  "votesACount" INTEGER NOT NULL DEFAULT 0,
  "votesBCount" INTEGER NOT NULL DEFAULT 0,
  "likesCount" INTEGER NOT NULL DEFAULT 0,
  "dislikesCount" INTEGER NOT NULL DEFAULT 0,
  "commentsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CharacterComparison_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CharacterComparison_slug_key" ON "CharacterComparison"("slug");
CREATE INDEX "CharacterComparison_status_createdAt_idx" ON "CharacterComparison"("status", "createdAt");
CREATE INDEX "CharacterComparison_authorId_idx" ON "CharacterComparison"("authorId");
CREATE INDEX "CharacterComparison_characterAId_idx" ON "CharacterComparison"("characterAId");
CREATE INDEX "CharacterComparison_characterBId_idx" ON "CharacterComparison"("characterBId");

-- CreateTable ComparisonVote
CREATE TABLE "ComparisonVote" (
  "id" TEXT NOT NULL,
  "comparisonId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "side" "ComparisonSide" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComparisonVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComparisonVote_comparisonId_userId_key" ON "ComparisonVote"("comparisonId", "userId");
CREATE INDEX "ComparisonVote_userId_idx" ON "ComparisonVote"("userId");

-- CreateTable Comment
CREATE TABLE "Comment" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "debateId" TEXT,
  "comparisonId" TEXT,
  "characterId" TEXT,
  "parentId" TEXT,
  "body" TEXT NOT NULL,
  "likesCount" INTEGER NOT NULL DEFAULT 0,
  "dislikesCount" INTEGER NOT NULL DEFAULT 0,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "editedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Comment_debateId_createdAt_idx" ON "Comment"("debateId", "createdAt");
CREATE INDEX "Comment_comparisonId_createdAt_idx" ON "Comment"("comparisonId", "createdAt");
CREATE INDEX "Comment_characterId_createdAt_idx" ON "Comment"("characterId", "createdAt");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateTable Reaction
CREATE TABLE "Reaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "debateId" TEXT,
  "comparisonId" TEXT,
  "commentId" TEXT,
  "value" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Reaction_userId_debateId_key" ON "Reaction"("userId", "debateId");
CREATE UNIQUE INDEX "Reaction_userId_comparisonId_key" ON "Reaction"("userId", "comparisonId");
CREATE UNIQUE INDEX "Reaction_userId_commentId_key" ON "Reaction"("userId", "commentId");
CREATE INDEX "Reaction_debateId_idx" ON "Reaction"("debateId");
CREATE INDEX "Reaction_comparisonId_idx" ON "Reaction"("comparisonId");
CREATE INDEX "Reaction_commentId_idx" ON "Reaction"("commentId");

-- CreateTable Favorite
CREATE TABLE "Favorite" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "characterId" TEXT,
  "debateId" TEXT,
  "comparisonId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Favorite_userId_characterId_key" ON "Favorite"("userId", "characterId");
CREATE UNIQUE INDEX "Favorite_userId_debateId_key" ON "Favorite"("userId", "debateId");
CREATE UNIQUE INDEX "Favorite_userId_comparisonId_key" ON "Favorite"("userId", "comparisonId");
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");

-- CreateTable Badge
CREATE TABLE "Badge" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "ruleType" "BadgeRuleType" NOT NULL,
  "threshold" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Badge_slug_key" ON "Badge"("slug");

-- CreateTable UserBadge
CREATE TABLE "UserBadge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "badgeId" TEXT NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");

-- CreateTable Notification
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorId" TEXT,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "linkUrl" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateTable XpEvent
CREATE TABLE "XpEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "refType" TEXT,
  "refId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "XpEvent_userId_createdAt_idx" ON "XpEvent"("userId", "createdAt");

-- CreateTable ModerationLog
CREATE TABLE "ModerationLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ModerationLog_createdAt_idx" ON "ModerationLog"("createdAt");
CREATE INDEX "ModerationLog_adminId_idx" ON "ModerationLog"("adminId");

-- AddForeignKeys
ALTER TABLE "Debate" ADD CONSTRAINT "Debate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Debate" ADD CONSTRAINT "Debate_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Debate" ADD CONSTRAINT "Debate_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CharacterComparison" ADD CONSTRAINT "CharacterComparison_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterComparison" ADD CONSTRAINT "CharacterComparison_characterAId_fkey" FOREIGN KEY ("characterAId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CharacterComparison" ADD CONSTRAINT "CharacterComparison_characterBId_fkey" FOREIGN KEY ("characterBId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ComparisonVote" ADD CONSTRAINT "ComparisonVote_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "CharacterComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComparisonVote" ADD CONSTRAINT "ComparisonVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "CharacterComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "CharacterComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "CharacterComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationLog" ADD CONSTRAINT "ModerationLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
