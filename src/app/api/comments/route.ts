import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { awardXp, notifyUser, XP_REWARDS } from "@/lib/gamification";
import { sanitizeText } from "@/lib/sanitize";
import { createCommentSchema, firstIssue } from "@/lib/validation";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");
  if (!targetType || !targetId) return jsonError("Missing target parameters.");

  const where: Record<string, unknown> = { isDeleted: false };
  if (targetType === "DEBATE") where.debateId = targetId;
  else if (targetType === "COMPARISON") where.comparisonId = targetId;
  else if (targetType === "CHARACTER") where.characterId = targetId;
  else return jsonError("Unsupported targetType.");

  const comments = await prisma.comment.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 200,
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
  });

  return NextResponse.json({ ok: true, comments });
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in to comment.", 401);
  if (!rateLimit(`comment:create:${user.id}`, 25, 10 * 60_000)) {
    return jsonError("You are commenting too fast. Please wait a moment.", 429);
  }

  const parsed = createCommentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const body = sanitizeText(parsed.data.body);
  if (body.length < 2) return jsonError("Comment cannot be empty.");

  const { targetType, targetId, parentId } = parsed.data;
  let ownerId: string | null = null;
  let linkUrl = "/";
  let targetTitle = "";

  if (targetType === "DEBATE") {
    const debate = await prisma.debate.findUnique({ where: { id: targetId } });
    if (!debate || debate.status === "HIDDEN") return jsonError("Debate not found.", 404);
    if (debate.status === "LOCKED") return jsonError("This debate is locked.", 403);
    ownerId = debate.authorId;
    linkUrl = `/debates/${debate.slug}`;
    targetTitle = debate.title;
  } else if (targetType === "COMPARISON") {
    const comp = await prisma.characterComparison.findUnique({ where: { id: targetId } });
    if (!comp || comp.status === "HIDDEN") return jsonError("Comparison not found.", 404);
    if (comp.status === "LOCKED") return jsonError("This comparison is locked.", 403);
    ownerId = comp.authorId;
    linkUrl = `/comparisons/${comp.slug}`;
    targetTitle = comp.title;
  } else {
    const ch = await prisma.character.findUnique({ where: { id: targetId } });
    if (!ch || !ch.enabled) return jsonError("Character not found.", 404);
    linkUrl = `/characters/${ch.id}`;
    targetTitle = ch.name;
  }

  let parentAuthorId: string | null = null;
  if (parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentId } });
    if (!parent || parent.isDeleted) return jsonError("Parent comment not found.", 404);
    parentAuthorId = parent.authorId;
  }

  const comment = await prisma.comment.create({
    data: {
      authorId: user.id,
      debateId: targetType === "DEBATE" ? targetId : null,
      comparisonId: targetType === "COMPARISON" ? targetId : null,
      characterId: targetType === "CHARACTER" ? targetId : null,
      parentId: parentId ?? null,
      body,
    },
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
  });

  if (targetType === "DEBATE") {
    await prisma.debate.update({ where: { id: targetId }, data: { commentsCount: { increment: 1 } } });
  } else if (targetType === "COMPARISON") {
    await prisma.characterComparison.update({ where: { id: targetId }, data: { commentsCount: { increment: 1 } } });
  }

  await prisma.user.update({ where: { id: user.id }, data: { commentsCount: { increment: 1 } } });
  await awardXp({
    userId: user.id,
    amount: XP_REWARDS.POST_COMMENT,
    reason: "Posted a community comment",
    refType: "COMMENT",
    refId: comment.id,
  });

  if (parentAuthorId && parentAuthorId !== user.id) {
    await notifyUser({
      userId: parentAuthorId,
      actorId: user.id,
      type: "COMMENT_REPLY",
      title: `${user.username} replied to your comment`,
      message: body.slice(0, 120),
      params: { actor: user.username },
      linkUrl,
    });
  } else if (ownerId && ownerId !== user.id) {
    await notifyUser({
      userId: ownerId,
      actorId: user.id,
      type: targetType === "DEBATE" ? "COMMENT_ON_DEBATE" : "COMMENT_ON_COMPARISON",
      title: `${user.username} commented on "${targetTitle.slice(0, 50)}"`,
      message: body.slice(0, 120),
      params: { actor: user.username, target: targetTitle.slice(0, 50) },
      linkUrl,
    });
  }

  return NextResponse.json({ ok: true, comment }, { status: 201 });
}
