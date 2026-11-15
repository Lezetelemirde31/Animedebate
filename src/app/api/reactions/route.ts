import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { awardXp, XP_REWARDS } from "@/lib/gamification";
import { firstIssue, reactionSchema } from "@/lib/validation";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in to react.", 401);
  if (!rateLimit(`react:${user.id}`, 60, 60_000)) {
    return jsonError("Too many reactions. Slow down a bit.", 429);
  }

  const parsed = reactionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const { targetType, targetId, value } = parsed.data;
  let authorId: string | null = null;

  if (targetType === "DEBATE") {
    const row = await prisma.debate.findUnique({ where: { id: targetId }, select: { id: true, authorId: true, status: true } });
    if (!row || row.status === "HIDDEN") return jsonError("Debate not found.", 404);
    authorId = row.authorId;
  } else if (targetType === "COMPARISON") {
    const row = await prisma.characterComparison.findUnique({ where: { id: targetId }, select: { id: true, authorId: true, status: true } });
    if (!row || row.status === "HIDDEN") return jsonError("Comparison not found.", 404);
    authorId = row.authorId;
  } else {
    const row = await prisma.comment.findUnique({ where: { id: targetId }, select: { id: true, authorId: true, isDeleted: true } });
    if (!row || row.isDeleted) return jsonError("Comment not found.", 404);
    authorId = row.authorId;
  }

  const existing =
    targetType === "DEBATE"
      ? await prisma.reaction.findUnique({ where: { userId_debateId: { userId: user.id, debateId: targetId } } })
      : targetType === "COMPARISON"
        ? await prisma.reaction.findUnique({ where: { userId_comparisonId: { userId: user.id, comparisonId: targetId } } })
        : await prisma.reaction.findUnique({ where: { userId_commentId: { userId: user.id, commentId: targetId } } });

  let likesDelta = 0;
  let dislikesDelta = 0;
  let nextValue: number | null = value;

  if (!existing) {
    await prisma.reaction.create({
      data: {
        userId: user.id,
        debateId: targetType === "DEBATE" ? targetId : null,
        comparisonId: targetType === "COMPARISON" ? targetId : null,
        commentId: targetType === "COMMENT" ? targetId : null,
        value,
      },
    });
    if (value === 1) likesDelta = 1;
    else dislikesDelta = 1;
  } else if (existing.value === value) {
    // Toggle off
    await prisma.reaction.delete({ where: { id: existing.id } });
    nextValue = null;
    if (value === 1) likesDelta = -1;
    else dislikesDelta = -1;
  } else {
    // Switch from like <-> dislike
    await prisma.reaction.update({ where: { id: existing.id }, data: { value } });
    if (value === 1) {
      likesDelta = 1;
      dislikesDelta = -1;
    } else {
      likesDelta = -1;
      dislikesDelta = 1;
    }
  }

  const counterUpdate: Record<string, { increment?: number; decrement?: number }> = {};
  if (likesDelta > 0) counterUpdate.likesCount = { increment: likesDelta };
  else if (likesDelta < 0) counterUpdate.likesCount = { decrement: Math.abs(likesDelta) };
  if (dislikesDelta > 0) counterUpdate.dislikesCount = { increment: dislikesDelta };
  else if (dislikesDelta < 0) counterUpdate.dislikesCount = { decrement: Math.abs(dislikesDelta) };

  let counts = { likesCount: 0, dislikesCount: 0 };
  if (targetType === "DEBATE") {
    counts = await prisma.debate.update({
      where: { id: targetId },
      data: counterUpdate,
      select: { likesCount: true, dislikesCount: true },
    });
  } else if (targetType === "COMPARISON") {
    counts = await prisma.characterComparison.update({
      where: { id: targetId },
      data: counterUpdate,
      select: { likesCount: true, dislikesCount: true },
    });
  } else {
    counts = await prisma.comment.update({
      where: { id: targetId },
      data: counterUpdate,
      select: { likesCount: true, dislikesCount: true },
    });
  }

  if (authorId && authorId !== user.id && likesDelta !== 0) {
    await prisma.user.update({
      where: { id: authorId },
      data: {
        likesReceived: likesDelta > 0 ? { increment: likesDelta } : { decrement: Math.abs(likesDelta) },
      },
    });
    if (likesDelta > 0) {
      await awardXp({
        userId: authorId,
        amount: XP_REWARDS.RECEIVE_LIKE,
        reason: "Received a community like",
        refType: targetType,
        refId: targetId,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    value: nextValue,
    likesCount: counts.likesCount,
    dislikesCount: counts.dislikesCount,
  });
}
