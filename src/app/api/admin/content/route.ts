import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth/server";
import { isSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const actor = await getCurrentUser();
  if (!actor || !isStaff(actor)) return jsonError("Administrator access required.", 403);

  const body = (await req.json().catch(() => null)) as {
    targetType?: "DEBATE" | "COMPARISON" | "COMMENT";
    targetId?: string;
    action?: "PIN" | "UNPIN" | "LOCK" | "OPEN" | "HIDE" | "DELETE";
    reason?: string;
  } | null;

  if (!body?.targetType || !body?.targetId || !body?.action) {
    return jsonError("Missing moderation parameters.");
  }

  const { targetType, targetId, action, reason } = body;

  if (targetType === "DEBATE") {
    if (action === "DELETE") {
      await prisma.debate.delete({ where: { id: targetId } });
    } else {
      const data =
        action === "PIN"
          ? { isPinned: true }
          : action === "UNPIN"
            ? { isPinned: false }
            : action === "LOCK"
              ? { status: "LOCKED" as const }
              : action === "HIDE"
                ? { status: "HIDDEN" as const }
                : { status: "OPEN" as const };
      await prisma.debate.update({ where: { id: targetId }, data });
    }
  } else if (targetType === "COMPARISON") {
    if (action === "DELETE") {
      await prisma.characterComparison.delete({ where: { id: targetId } });
    } else {
      const data =
        action === "LOCK"
          ? { status: "LOCKED" as const }
          : action === "HIDE"
            ? { status: "HIDDEN" as const }
            : { status: "OPEN" as const };
      await prisma.characterComparison.update({ where: { id: targetId }, data });
    }
  } else if (targetType === "COMMENT") {
    if (action === "DELETE") {
      const existing = await prisma.comment.findUnique({ where: { id: targetId } });
      if (existing && !existing.isDeleted) {
        await prisma.comment.update({ where: { id: targetId }, data: { isDeleted: true } });
        if (existing.debateId) {
          await prisma.debate.update({ where: { id: existing.debateId }, data: { commentsCount: { decrement: 1 } } });
        } else if (existing.comparisonId) {
          await prisma.characterComparison.update({ where: { id: existing.comparisonId }, data: { commentsCount: { decrement: 1 } } });
        }
      }
    }
  } else {
    return jsonError("Unsupported target type.");
  }

  await prisma.moderationLog.create({
    data: {
      adminId: actor.id,
      action: `${action}_${targetType}`,
      targetType,
      targetId,
      reason: reason ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
