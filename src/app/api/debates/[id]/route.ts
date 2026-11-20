import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth/server";
import { sanitizeText } from "@/lib/sanitize";
import { firstIssue, updateDebateSchema } from "@/lib/validation";
import { isSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);

  const { id } = await params;
  const debate = await prisma.debate.findUnique({ where: { id } });
  if (!debate) return jsonError("Debate not found.", 404);

  const staff = isStaff(user);
  if (debate.authorId !== user.id && !staff) {
    return jsonError("You do not have permission to edit this debate.", 403);
  }

  const parsed = updateDebateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = sanitizeText(parsed.data.title);
  if (parsed.data.content !== undefined) data.content = sanitizeText(parsed.data.content);
  if (parsed.data.category !== undefined) data.category = parsed.data.category;

  if (parsed.data.status !== undefined) {
    if (!staff) return jsonError("Only moderators can change debate status.", 403);
    data.status = parsed.data.status;
  }
  if (parsed.data.isPinned !== undefined) {
    if (!staff) return jsonError("Only moderators can pin debates.", 403);
    data.isPinned = parsed.data.isPinned;
  }

  const updated = await prisma.debate.update({ where: { id }, data });
  if (staff && (parsed.data.status !== undefined || parsed.data.isPinned !== undefined)) {
    await prisma.moderationLog.create({
      data: {
        adminId: user.id,
        action: `UPDATE_DEBATE`,
        targetType: "DEBATE",
        targetId: id,
        reason: `status=${updated.status}, pinned=${updated.isPinned}`,
      },
    });
  }

  return NextResponse.json({ ok: true, debate: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);

  const { id } = await params;
  const debate = await prisma.debate.findUnique({ where: { id } });
  if (!debate) return jsonError("Debate not found.", 404);

  const staff = isStaff(user);
  if (debate.authorId !== user.id && !staff) {
    return jsonError("You do not have permission to delete this debate.", 403);
  }

  await prisma.debate.delete({ where: { id } });
  if (staff && debate.authorId !== user.id) {
    await prisma.moderationLog.create({
      data: {
        adminId: user.id,
        action: "DELETE_DEBATE",
        targetType: "DEBATE",
        targetId: id,
        reason: debate.title,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
