import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session-store";
import { setPreviewCookie, setSessionCookie } from "@/lib/auth/cookie";
import { encodePreviewAccount, previewModeActive } from "@/lib/auth/preview-session";
import { isSecureRequest } from "@/lib/auth/server";
import { authErrorMessage, getAuthRequestLocale, localizeAuthZodError } from "@/lib/auth/messages";
import { registerSchema } from "@/lib/validation";
import { clientIp, isSameOrigin, jsonError, rateLimit } from "@/lib/http";
import { AVATAR_STYLES } from "@/lib/avatars";

export async function POST(req: NextRequest) {
  const locale = getAuthRequestLocale(req);
  if (!isSameOrigin(req)) return jsonError(authErrorMessage(locale, "crossSiteBlocked"), 403);
  if (!rateLimit(`register:${clientIp(req)}`, 10, 60 * 60_000)) {
    return jsonError(authErrorMessage(locale, "tooManyRegister"), 429);
  }
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return jsonError(localizeAuthZodError(parsed.error, locale));
  const { username, password, avatarStyle } = parsed.data;
  const usernameKey = username.toLowerCase();

  try {
    const existing = await prisma.user.findUnique({ where: { usernameKey }, select: { id: true } });
    if (existing) {
      return jsonError(authErrorMessage(locale, "usernameTaken"), 409);
    }

    const styles = Object.keys(AVATAR_STYLES);
    const chosenStyle = avatarStyle ?? styles[Math.floor(Math.random() * styles.length)];
    const isFirstUser = (await prisma.user.count()) === 0;
    const user = await prisma.user.create({
      data: {
        username,
        usernameKey,
        passwordHash: await hashPassword(password),
        avatarStyle: chosenStyle,
        role: isFirstUser ? "ADMIN" : "USER",
      },
    });
    const session = await createSession(user.id);
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
    const secure = await isSecureRequest();
    setSessionCookie(res, session.token, session.expiresAt, secure);
    // Demo mode: lets any server instance recognise this account (see preview-session.ts).
    if (previewModeActive()) setPreviewCookie(res, encodePreviewAccount(user, session.token), session.expiresAt, secure);
    return res;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return jsonError(authErrorMessage(locale, "usernameTaken"), 409);
    }
    console.error("[auth/register] failed:", err);
    return jsonError(authErrorMessage(locale, "genericError"), 500);
  }
}
