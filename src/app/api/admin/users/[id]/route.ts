import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { notifyUser, levelFromXp } from "@/lib/gamification";
import { sanitizeText } from "@/lib/sanitize";
import { adminUserUpdateSchema, firstIssue } from "@/lib/validation";
import { isSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const actor = await getCurrentUser();
  if (!actor) return jsonError("Please sign in.", 401);
  if (actor.role !== "ADMIN" && actor.role !== "MODERATOR") {
    return jsonError("Administrator access required.", 403);
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return jsonError("User not found.", 404);

  const parsed = adminUserUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const { role, isBanned, bannedReason, xpDelta } = parsed.data;
  const data: Record<string, unknown> = {};

  if (role !== undefined) {
    if (actor.role !== "ADMIN") return jsonError("Only full administrators can change user roles.", 403);
    if (target.id === actor.id && role !== "ADMIN") {
      return jsonError("You cannot demote your own admin account.", 400);
    }
    data.role = role;
  }

  if (isBanned !== undefined) {
    if (target.id === actor.id) return jsonError("You cannot ban yourself.", 400);
    if (target.role === "ADMIN" && actor.role !== "ADMIN") {
      return jsonError("Moderators cannot ban administrators.", 403);
    }
    data.isBanned = isBanned;
    data.bannedReason = isBanned ? sanitizeText(bannedReason ?? "Violation of community guidelines") : null;
    if (isBanned) {
      await prisma.session.deleteMany({ where: { userId: target.id } });
    }
  }

  if (xpDelta !== undefined && xpDelta !== 0) {
    const nextXp = Math.max(0, target.xp + xpDelta);
    data.xp = nextXp;
    data.level = levelFromXp(nextXp);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, role: true, isBanned: true, bannedReason: true, xp: true, level: true },
  });

  await prisma.moderationLog.create({
    data: {
      adminId: actor.id,
      action: isBanned !== undefined ? (isBanned ? "BAN_USER" : "UNBAN_USER") : role ? "CHANGE_ROLE" : "ADJUST_XP",
      targetType: "USER",
      targetId: target.id,
      reason: bannedReason ?? (role ? `role -> ${role}` : xpDelta ? `xpDelta ${xpDelta}` : null),
    },
  });

  if (isBanned === false) {
    await notifyUser({
      userId: target.id,
      actorId: actor.id,
      type: "MODERATION",
      title: "Account restored",
      message: "Your account suspension has been lifted.",
      linkUrl: "/profile",
    });
  }

  return NextResponse.json({ ok: true, user: updated });
}
