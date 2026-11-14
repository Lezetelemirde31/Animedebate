import { prisma } from "@/lib/db";
import { SESSION_TTL_MS, generateSessionToken, hashToken } from "./tokens";

export interface SessionUser {
  id: string;
  username: string;
  avatarStyle: string;
  avatarImage: string | null;
}

/** Creates a session row and returns the raw token for the cookie. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

/** Resolves a raw session token to its user, or null if missing/expired. */
export async function getUserBySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { avatarCharacter: { select: { imageUrl: true } } } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const u = session.user;
  return {
    id: u.id,
    username: u.username,
    avatarStyle: u.avatarStyle,
    avatarImage: u.avatarCharacter?.imageUrl ?? null,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
