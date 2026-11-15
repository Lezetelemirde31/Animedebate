import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePasswordSchema, firstIssue } from "@/lib/validation";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);
  if (!rateLimit(`pw:${user.id}`, 8, 15 * 60_000)) {
    return jsonError("Too many password change attempts. Try again later.", 429);
  }

  const parsed = changePasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record) return jsonError("Account not found.", 404);

  const valid = await verifyPassword(parsed.data.currentPassword, record.passwordHash);
  if (!valid) return jsonError("Current password is incorrect.", 401);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  return NextResponse.json({ ok: true });
}
