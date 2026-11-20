import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { Avatar } from "@/components/ui/Avatar";
import { ComparisonVoteBar } from "@/components/community/ComparisonVoteBar";
import { ReactionBar } from "@/components/community/ReactionBar";
import { FavoriteButton } from "@/components/community/FavoriteButton";
import { ModerationActions } from "@/components/community/ModerationActions";
import { CommentSection, type CommentItemDTO } from "@/components/community/CommentSection";
import { timeAgo } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const comp = await prisma.characterComparison.findUnique({ where: { slug }, select: { title: true } });
  return { title: comp?.title ?? "VS Eşleşmesi" };
}

export default async function ComparisonDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, { locale, t }] = await Promise.all([params, getServerTranslations()]);
  const user = await getCurrentUser();
  const staff = isStaff(user);

  const comp = await prisma.characterComparison.findUnique({
    where: { slug },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          level: true,
          avatarStyle: true,
          avatarCustomUrl: true,
          avatarCharacter: { select: { imageUrl: true } },
        },
      },
      characterA: true,
      characterB: true,
    },
  });

  if (!comp || (comp.status === "HIDDEN" && !staff && comp.authorId !== user?.id)) {
    notFound();
  }

  const [myVote, myReaction, myFav, commentsRaw, myCommentReactions] = await Promise.all([
    user
      ? prisma.comparisonVote.findUnique({ where: { comparisonId_userId: { comparisonId: comp.id, userId: user.id } } })
      : null,
    user
      ? prisma.reaction.findUnique({ where: { userId_comparisonId: { userId: user.id, comparisonId: comp.id } } })
      : null,
    user
      ? prisma.favorite.findUnique({ where: { userId_comparisonId: { userId: user.id, comparisonId: comp.id } } })
      : null,
    prisma.comment.findMany({
      where: { comparisonId: comp.id, isDeleted: false },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            role: true,
            level: true,
            avatarStyle: true,
            avatarCustomUrl: true,
            avatarCharacter: { select: { imageUrl: true } },
          },
        },
      },
    }),
    user
      ? prisma.reaction.findMany({ where: { userId: user.id, commentId: { not: null } }, select: { commentId: true, value: true } })
      : [],
  ]);

  const reactionByComment = new Map(myCommentReactions.map((r) => [r.commentId!, r.value]));
  const comments: CommentItemDTO[] = commentsRaw.map((c) => ({
    id: c.id,
    authorId: c.authorId,
    parentId: c.parentId,
    body: c.body,
    likesCount: c.likesCount,
    dislikesCount: c.dislikesCount,
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    userReaction: reactionByComment.get(c.id) ?? null,
    author: {
      id: c.author.id,
      username: c.author.username,
      role: c.author.role,
      level: c.author.level,
      avatarStyle: c.author.avatarStyle,
      avatarImage: c.author.avatarCustomUrl ?? c.author.avatarCharacter?.imageUrl ?? null,
    },
  }));

  const authorImg = comp.author.avatarCustomUrl ?? comp.author.avatarCharacter?.imageUrl ?? null;
  const critLabel = t.comparisons.criteria[comp.criteria as keyof typeof t.comparisons.criteria] ?? comp.criteria;

  return (
    <div className="space-y-8">
      <Link href="/comparisons" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.comparisons.allMatchupsLink}
      </Link>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-purple-200">
            {critLabel}
          </span>
          {comp.status === "LOCKED" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
              <Lock className="h-3 w-3" /> {t.debates.locked}
            </span>
          )}
        </div>
        <h1 className="break-words font-display text-3xl font-bold text-white md:text-4xl">{comp.title}</h1>
        <p className="text-zinc-300">{comp.description}</p>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <Avatar username={comp.author.username} style={comp.author.avatarStyle} imageUrl={authorImg} size={26} />
          <Link href={`/profile/${comp.author.username}`} className="font-semibold text-white hover:underline">
            {comp.author.username}
          </Link>
          <span>{t.nav.levelShort}.{comp.author.level}</span>
          <span>· {timeAgo(comp.createdAt, locale)}</span>
        </div>
      </div>

      <ComparisonVoteBar
        comparisonId={comp.id}
        charA={comp.characterA}
        charB={comp.characterB}
        initialVotesA={comp.votesACount}
        initialVotesB={comp.votesBCount}
        initialSide={myVote?.side ?? null}
        signedIn={Boolean(user)}
        locked={comp.status === "LOCKED"}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ReactionBar
            targetType="COMPARISON"
            targetId={comp.id}
            initialLikes={comp.likesCount}
            initialDislikes={comp.dislikesCount}
            initialValue={myReaction?.value ?? null}
            signedIn={Boolean(user)}
          />
          <FavoriteButton
            targetType="COMPARISON"
            targetId={comp.id}
            initialFavorited={Boolean(myFav)}
            signedIn={Boolean(user)}
          />
        </div>

        <ModerationActions
          targetType="COMPARISON"
          targetId={comp.id}
          status={comp.status}
          isAuthor={user?.id === comp.authorId}
          isStaff={staff}
          redirectAfterDelete="/comparisons"
        />
      </div>

      <CommentSection
        targetType="COMPARISON"
        targetId={comp.id}
        initialComments={comments}
        locked={comp.status === "LOCKED"}
      />
    </div>
  );
}
