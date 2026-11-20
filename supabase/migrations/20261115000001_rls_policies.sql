-- Supabase Row Level Security (RLS) Policies for Anime Debate & Auction
-- Run this script in Supabase SQL Editor (or include via Supabase CLI migrations)
-- after applying Prisma migrations. Safe & idempotent to re-run.

-- Helper: Resolve active user id from either Supabase Auth JWT (`auth.uid()`)
-- or server-injected session context (`app.current_user_id`).
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_user_id', true), ''),
    auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = public.current_app_user_id()
      AND u."role" IN ('ADMIN', 'MODERATOR')
      AND u."isBanned" = false
  );
$$;

-- ─── Enable RLS on every table ──────────────────────────────────────────────
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Anime" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Character" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Match" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatchPlayer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuctionLot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bid" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnedCharacter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Debate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CharacterComparison" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComparisonVote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Favorite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Badge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserBadge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "XpEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModerationLog" ENABLE ROW LEVEL SECURITY;

-- ─── Public Read Catalog Tables ─────────────────────────────────────────────
DROP POLICY IF EXISTS "anime_public_read" ON "Anime";
CREATE POLICY "anime_public_read" ON "Anime"
  FOR SELECT USING ("enabled" = true OR public.is_app_admin());

DROP POLICY IF EXISTS "character_public_read" ON "Character";
CREATE POLICY "character_public_read" ON "Character"
  FOR SELECT USING ("enabled" = true OR public.is_app_admin());

DROP POLICY IF EXISTS "badge_public_read" ON "Badge";
CREATE POLICY "badge_public_read" ON "Badge"
  FOR SELECT USING (true);

-- ─── User & Session Security ────────────────────────────────────────────────
-- Password hashes & sessions are never exposed via anon/authenticated API.
REVOKE ALL ON TABLE "Session" FROM anon, authenticated;
REVOKE SELECT ("passwordHash") ON TABLE "User" FROM anon, authenticated;

DROP POLICY IF EXISTS "user_public_profile_read" ON "User";
CREATE POLICY "user_public_profile_read" ON "User"
  FOR SELECT USING ("isBanned" = false OR "id" = public.current_app_user_id() OR public.is_app_admin());

DROP POLICY IF EXISTS "user_self_update" ON "User";
CREATE POLICY "user_self_update" ON "User"
  FOR UPDATE USING ("id" = public.current_app_user_id() AND "isBanned" = false)
  WITH CHECK ("id" = public.current_app_user_id() AND "isBanned" = false);

DROP POLICY IF EXISTS "user_admin_manage" ON "User";
CREATE POLICY "user_admin_manage" ON "User"
  FOR ALL USING (public.is_app_admin());

-- ─── Debates ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "debate_public_read" ON "Debate";
CREATE POLICY "debate_public_read" ON "Debate"
  FOR SELECT USING ("status" <> 'HIDDEN' OR "authorId" = public.current_app_user_id() OR public.is_app_admin());

DROP POLICY IF EXISTS "debate_auth_insert" ON "Debate";
CREATE POLICY "debate_auth_insert" ON "Debate"
  FOR INSERT WITH CHECK (
    "authorId" = public.current_app_user_id()
    AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = public.current_app_user_id() AND u."isBanned" = false)
  );

DROP POLICY IF EXISTS "debate_owner_or_admin_update" ON "Debate";
CREATE POLICY "debate_owner_or_admin_update" ON "Debate"
  FOR UPDATE USING ("authorId" = public.current_app_user_id() OR public.is_app_admin())
  WITH CHECK ("authorId" = public.current_app_user_id() OR public.is_app_admin());

DROP POLICY IF EXISTS "debate_owner_or_admin_delete" ON "Debate";
CREATE POLICY "debate_owner_or_admin_delete" ON "Debate"
  FOR DELETE USING ("authorId" = public.current_app_user_id() OR public.is_app_admin());

-- ─── Character Comparisons ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "comparison_public_read" ON "CharacterComparison";
CREATE POLICY "comparison_public_read" ON "CharacterComparison"
  FOR SELECT USING ("status" <> 'HIDDEN' OR "authorId" = public.current_app_user_id() OR public.is_app_admin());

DROP POLICY IF EXISTS "comparison_auth_insert" ON "CharacterComparison";
CREATE POLICY "comparison_auth_insert" ON "CharacterComparison"
  FOR INSERT WITH CHECK (
    "authorId" = public.current_app_user_id()
    AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = public.current_app_user_id() AND u."isBanned" = false)
  );

DROP POLICY IF EXISTS "comparison_owner_or_admin_update" ON "CharacterComparison";
CREATE POLICY "comparison_owner_or_admin_update" ON "CharacterComparison"
  FOR UPDATE USING ("authorId" = public.current_app_user_id() OR public.is_app_admin());

DROP POLICY IF EXISTS "comparison_owner_or_admin_delete" ON "CharacterComparison";
CREATE POLICY "comparison_owner_or_admin_delete" ON "CharacterComparison"
  FOR DELETE USING ("authorId" = public.current_app_user_id() OR public.is_app_admin());

-- ─── Comparison Votes ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "comparison_vote_public_read" ON "ComparisonVote";
CREATE POLICY "comparison_vote_public_read" ON "ComparisonVote"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "comparison_vote_owner_write" ON "ComparisonVote";
CREATE POLICY "comparison_vote_owner_write" ON "ComparisonVote"
  FOR ALL USING ("userId" = public.current_app_user_id())
  WITH CHECK ("userId" = public.current_app_user_id());

-- ─── Comments ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "comment_public_read" ON "Comment";
CREATE POLICY "comment_public_read" ON "Comment"
  FOR SELECT USING ("isDeleted" = false OR "authorId" = public.current_app_user_id() OR public.is_app_admin());

DROP POLICY IF EXISTS "comment_auth_insert" ON "Comment";
CREATE POLICY "comment_auth_insert" ON "Comment"
  FOR INSERT WITH CHECK (
    "authorId" = public.current_app_user_id()
    AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = public.current_app_user_id() AND u."isBanned" = false)
  );

DROP POLICY IF EXISTS "comment_owner_or_admin_update" ON "Comment";
CREATE POLICY "comment_owner_or_admin_update" ON "Comment"
  FOR UPDATE USING ("authorId" = public.current_app_user_id() OR public.is_app_admin());

DROP POLICY IF EXISTS "comment_owner_or_admin_delete" ON "Comment";
CREATE POLICY "comment_owner_or_admin_delete" ON "Comment"
  FOR DELETE USING ("authorId" = public.current_app_user_id() OR public.is_app_admin());

-- ─── Reactions, Favorites, Notifications, Badges & XP ───────────────────────
DROP POLICY IF EXISTS "reaction_public_read" ON "Reaction";
CREATE POLICY "reaction_public_read" ON "Reaction"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "reaction_owner_write" ON "Reaction";
CREATE POLICY "reaction_owner_write" ON "Reaction"
  FOR ALL USING ("userId" = public.current_app_user_id())
  WITH CHECK ("userId" = public.current_app_user_id());

DROP POLICY IF EXISTS "favorite_owner_read" ON "Favorite";
CREATE POLICY "favorite_owner_read" ON "Favorite"
  FOR SELECT USING ("userId" = public.current_app_user_id());

DROP POLICY IF EXISTS "favorite_owner_write" ON "Favorite";
CREATE POLICY "favorite_owner_write" ON "Favorite"
  FOR ALL USING ("userId" = public.current_app_user_id())
  WITH CHECK ("userId" = public.current_app_user_id());

DROP POLICY IF EXISTS "user_badge_public_read" ON "UserBadge";
CREATE POLICY "user_badge_public_read" ON "UserBadge"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "notification_owner_read_update" ON "Notification";
CREATE POLICY "notification_owner_read_update" ON "Notification"
  FOR SELECT USING ("userId" = public.current_app_user_id());

DROP POLICY IF EXISTS "notification_owner_update" ON "Notification";
CREATE POLICY "notification_owner_update" ON "Notification"
  FOR UPDATE USING ("userId" = public.current_app_user_id())
  WITH CHECK ("userId" = public.current_app_user_id());

DROP POLICY IF EXISTS "xp_event_public_read" ON "XpEvent";
CREATE POLICY "xp_event_public_read" ON "XpEvent"
  FOR SELECT USING ("userId" = public.current_app_user_id() OR public.is_app_admin());

-- ─── Auction & Moderation Audit Tables ──────────────────────────────────────
DROP POLICY IF EXISTS "match_public_read" ON "Match";
CREATE POLICY "match_public_read" ON "Match" FOR SELECT USING (true);

DROP POLICY IF EXISTS "match_player_public_read" ON "MatchPlayer";
CREATE POLICY "match_player_public_read" ON "MatchPlayer" FOR SELECT USING (true);

DROP POLICY IF EXISTS "auction_lot_public_read" ON "AuctionLot";
CREATE POLICY "auction_lot_public_read" ON "AuctionLot" FOR SELECT USING (true);

DROP POLICY IF EXISTS "bid_public_read" ON "Bid";
CREATE POLICY "bid_public_read" ON "Bid" FOR SELECT USING (true);

DROP POLICY IF EXISTS "owned_character_public_read" ON "OwnedCharacter";
CREATE POLICY "owned_character_public_read" ON "OwnedCharacter" FOR SELECT USING (true);

DROP POLICY IF EXISTS "moderation_log_admin_only" ON "ModerationLog";
CREATE POLICY "moderation_log_admin_only" ON "ModerationLog"
  FOR SELECT USING (public.is_app_admin());
