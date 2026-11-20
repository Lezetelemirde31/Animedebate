import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth/server";
import { isSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);

  const { id } = await params;
  const comp = await prisma.characterComparison.findUnique({ where: { id } });
  if (!comp) return jsonError("Comparison not found.", 404);

  const staff = isStaff(user);
  if (comp.authorId !== user.id && !staff) return jsonError("Forbidden.", 403);

  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  if (!body?.status || !["OPEN", "LOCKED", "HIDDEN"].includes(body.status)) {
    return jsonError("Invalid status.");
  }
  if (!staff && body.status === "HIDDEN") return jsonError("Only staff can hide comparisons.", 403);

  const updated = await prisma.characterComparison.update({
    where: { id },
    data: { status: body.status as "OPEN" | "LOCKED" | "HIDDEN" },
  });
  return NextResponse.json({ ok: true, comparison: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);

  const { id } = await params;
  const comp = await prisma.characterComparison.findUnique({ where: { id } });
  if (!comp) return jsonError("Comparison not found.", 404);

  const staff = isStaff(user);
  if (comp.authorId !== user.id && !staff) return jsonError("Forbidden.", 403);

  await prisma.characterComparison.delete({ where: { id } });
  if (staff && comp.authorId !== user.id) {
    await prisma.moderationLog.create({
      data: {
        adminId: user.id,
        action: "DELETE_COMPARISON",
        targetType: "COMPARISON",
        targetId: id,
        reason: comp.title,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
