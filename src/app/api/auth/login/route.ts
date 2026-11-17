import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session-store";
import { setSessionCookie } from "@/lib/auth/cookie";
import { isSecureRequest } from "@/lib/auth/server";
import { authErrorMessage, authSuspendedMessage, getAuthRequestLocale, localizeAuthZodError } from "@/lib/auth/messages";
import { loginSchema } from "@/lib/validation";
import { clientIp, isSameOrigin, jsonError, rateLimit } from "@/lib/http";

export async function POST(req: NextRequest) {
  const locale = getAuthRequestLocale(req);
  if (!isSameOrigin(req)) return jsonError(authErrorMessage(locale, "crossSiteBlocked"), 403);
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jsonError(localizeAuthZodError(parsed.error, locale));
  const { username, password } = parsed.data;
  const key = username.toLowerCase();

  if (!rateLimit(`login:${clientIp(req)}:${key}`, 10, 15 * 60_000)) {
    return jsonError(authErrorMessage(locale, "tooManyLogin"), 429);
  }

  const user = await prisma.user.findUnique({ where: { usernameKey: key } });
  // Always run bcrypt so response time does not reveal whether the user exists.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return jsonError(authErrorMessage(locale, "invalidCredentials"), 401);
  if (user.isBanned) {
    return jsonError(authSuspendedMessage(locale, user.bannedReason ?? null), 403);
  }

  const session = await createSession(user.id);
  const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
  setSessionCookie(res, session.token, session.expiresAt, await isSecureRequest());
  return res;
}
