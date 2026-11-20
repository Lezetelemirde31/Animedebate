import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Lock, Pin } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { Avatar } from "@/components/ui/Avatar";
import { AnimeBadge } from "@/components/character/badges";
import { ReactionBar } from "@/components/community/ReactionBar";
import { FavoriteButton } from "@/components/community/FavoriteButton";
import { ModerationActions } from "@/components/community/ModerationActions";
import { CommentSection, type CommentItemDTO } from "@/components/community/CommentSection";
import { timeAgo } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = await prisma.debate.findUnique({ where: { slug }, select: { title: true } });
  return { title: d?.title ?? "Tartışma" };
}

export default async function DebateDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, { locale, t }] = await Promise.all([params, getServerTranslations()]);
  const user = await getCurrentUser();
  const staff = isStaff(user);

  const debate = await prisma.debate.findUnique({
    where: { slug },
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
      anime: { select: { id: true, shortName: true } },
      character: { select: { id: true, name: true, animeId: true, imageUrl: true } },
    },
  });

  if (!debate || (debate.status === "HIDDEN" && !staff && debate.authorId !== user?.id)) {
    notFound();
  }

  await prisma.debate.update({ where: { id: debate.id }, data: { viewsCount: { increment: 1 } } }).catch(() => null);

  const [commentsRaw, myDebateReaction, myFav, myCommentReactions] = await Promise.all([
    prisma.comment.findMany({
      where: { debateId: debate.id, isDeleted: false },
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
    user ? prisma.reaction.findUnique({ where: { userId_debateId: { userId: user.id, debateId: debate.id } } }) : null,
    user ? prisma.favorite.findUnique({ where: { userId_debateId: { userId: user.id, debateId: debate.id } } }) : null,
    user
      ? prisma.reaction.findMany({
          where: { userId: user.id, commentId: { not: null } },
          select: { commentId: true, value: true },
        })
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

  const authorAvatar = debate.author.avatarCustomUrl ?? debate.author.avatarCharacter?.imageUrl ?? null;
  const catLabel = t.debates.categories[debate.category as keyof typeof t.debates.categories] ?? debate.category.replace("_", " ");

  return (
    <div className="space-y-8">
      <Link href="/debates" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.debates.allDebatesLink}
      </Link>

      <article className="glass-strong rounded-3xl p-6 md:p-8 neon-border animate-slide-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {debate.isPinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-semibold text-purple-200">
                <Pin className="h-3 w-3" /> {t.debates.pinned}
              </span>
            )}
            {debate.status === "LOCKED" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                <Lock className="h-3 w-3" /> {t.debates.locked}
              </span>
            )}
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs uppercase tracking-wider text-zinc-300">
              {catLabel}
            </span>
            {debate.anime && <AnimeBadge animeId={debate.anime.id} />}
            {debate.character && (
              <Link
                href={`/characters/${debate.character.id}`}
                className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-0.5 text-xs text-purple-200 hover:border-purple-400"
              >
                {debate.character.name}
              </Link>
            )}
          </div>
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <Eye className="h-3.5 w-3.5" /> {t.debates.viewsCount(debate.viewsCount + 1)}
          </span>
        </div>

        <h1 className="mt-4 break-words font-display text-3xl font-bold text-white md:text-4xl">{debate.title}</h1>

        <div className="mt-4 flex items-center gap-3 text-sm text-zinc-400">
          <Avatar username={debate.author.username} style={debate.author.avatarStyle} imageUrl={authorAvatar} size={34} />
          <div>
            <Link href={`/profile/${debate.author.username}`} className="font-display font-semibold text-white hover:underline">
              {debate.author.username}
            </Link>
            <span className="ml-2 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
              {t.nav.levelShort}.{debate.author.level}
            </span>
            <div className="text-xs text-zinc-500">{t.debates.postedAgo(timeAgo(debate.createdAt, locale))}</div>
          </div>
        </div>

        <div className="mt-6 whitespace-pre-wrap leading-relaxed text-zinc-200">{debate.content}</div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <ReactionBar
              targetType="DEBATE"
              targetId={debate.id}
              initialLikes={debate.likesCount}
              initialDislikes={debate.dislikesCount}
              initialValue={myDebateReaction?.value ?? null}
              signedIn={Boolean(user)}
            />
            <FavoriteButton
              targetType="DEBATE"
              targetId={debate.id}
              initialFavorited={Boolean(myFav)}
              signedIn={Boolean(user)}
            />
          </div>

          <ModerationActions
            targetType="DEBATE"
            targetId={debate.id}
            status={debate.status}
            isPinned={debate.isPinned}
            isAuthor={user?.id === debate.authorId}
            isStaff={staff}
            redirectAfterDelete="/debates"
          />
        </div>
      </article>

      <CommentSection
        targetType="DEBATE"
        targetId={debate.id}
        initialComments={comments}
        locked={debate.status === "LOCKED"}
      />
    </div>
  );
}
