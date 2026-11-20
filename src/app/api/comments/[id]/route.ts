import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth/server";
import { sanitizeText } from "@/lib/sanitize";
import { firstIssue, updateCommentSchema } from "@/lib/validation";
import { isSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);

  const { id } = await params;
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment || comment.isDeleted) return jsonError("Comment not found.", 404);
  if (comment.authorId !== user.id && !isStaff(user)) return jsonError("Forbidden.", 403);

  const parsed = updateCommentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const updated = await prisma.comment.update({
    where: { id },
    data: { body: sanitizeText(parsed.data.body), editedAt: new Date() },
  });
  return NextResponse.json({ ok: true, comment: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);

  const { id } = await params;
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment || comment.isDeleted) return jsonError("Comment not found.", 404);

  const staff = isStaff(user);
  if (comment.authorId !== user.id && !staff) return jsonError("Forbidden.", 403);

  await prisma.comment.update({ where: { id }, data: { isDeleted: true } });
  if (comment.debateId) {
    await prisma.debate.update({ where: { id: comment.debateId }, data: { commentsCount: { decrement: 1 } } });
  } else if (comment.comparisonId) {
    await prisma.characterComparison.update({
      where: { id: comment.comparisonId },
      data: { commentsCount: { decrement: 1 } },
    });
  }

  if (staff && comment.authorId !== user.id) {
    await prisma.moderationLog.create({
      data: {
        adminId: user.id,
        action: "DELETE_COMMENT",
        targetType: "COMMENT",
        targetId: id,
        reason: comment.body.slice(0, 120),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
