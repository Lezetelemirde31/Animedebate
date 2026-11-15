import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session-store";
import { setSessionCookie } from "@/lib/auth/cookie";
import { isSecureRequest } from "@/lib/auth/server";
import { firstIssue, registerSchema } from "@/lib/validation";
import { clientIp, isSameOrigin, jsonError, rateLimit } from "@/lib/http";
import { AVATAR_STYLES } from "@/lib/avatars";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  if (!rateLimit(`register:${clientIp(req)}`, 10, 60 * 60_000)) {
    return jsonError("Too many accounts created from this network. Try again later.", 429);
  }
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error));
  const { username, password } = parsed.data;

  const styles = Object.keys(AVATAR_STYLES);
  try {
    const isFirstUser = (await prisma.user.count()) === 0;
    const user = await prisma.user.create({
      data: {
        username,
        usernameKey: username.toLowerCase(),
        passwordHash: await hashPassword(password),
        avatarStyle: styles[Math.floor(Math.random() * styles.length)],
        role: isFirstUser ? "ADMIN" : "USER",
      },
    });
    const session = await createSession(user.id);
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
    setSessionCookie(res, session.token, session.expiresAt, await isSecureRequest());
    return res;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return jsonError("That username is already taken.", 409);
    }
    throw err;
  }
}
