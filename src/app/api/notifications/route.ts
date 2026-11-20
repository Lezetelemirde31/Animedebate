import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { isSameOrigin, jsonError } from "@/lib/http";
import { getServerLocale } from "@/lib/i18n-server";
import { notificationText } from "@/lib/notification-text";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      actor: {
        select: {
          username: true,
          avatarStyle: true,
          avatarCustomUrl: true,
          avatarCharacter: { select: { imageUrl: true } },
        },
      },
    },
  });
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const locale = await getServerLocale();
  const localized = notifications.map((n) => ({ ...n, ...notificationText(n, locale) }));
  return NextResponse.json({ ok: true, notifications: localized, unreadCount });
}

export async function PATCH(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);

  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  if (body.all) {
    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ ok: true });
  }
  if (body.id) {
    await prisma.notification.updateMany({
      where: { id: body.id, userId: user.id },
      data: { isRead: true },
    });
    return NextResponse.json({ ok: true });
  }
  return jsonError("Specify notification id or all: true.");
}
