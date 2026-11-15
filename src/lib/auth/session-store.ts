import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_TTL_MS, generateSessionToken, hashToken } from "./tokens";

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
  bio: string | null;
  xp: number;
  level: number;
  isBanned: boolean;
  avatarStyle: string;
  avatarImage: string | null;
  unreadNotifications: number;
}

/** Creates a session row and returns the raw token for the cookie. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

/** Resolves a raw session token to its user, or null if missing/expired/banned. */
export async function getUserBySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { avatarCharacter: { select: { imageUrl: true } } } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now() || session.user.isBanned) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const u = session.user;
  const unreadNotifications = await prisma.notification.count({
    where: { userId: u.id, isRead: false },
  });
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    bio: u.bio,
    xp: u.xp,
    level: u.level,
    isBanned: u.isBanned,
    avatarStyle: u.avatarStyle,
    avatarImage: u.avatarCustomUrl ?? u.avatarCharacter?.imageUrl ?? null,
    unreadNotifications,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
