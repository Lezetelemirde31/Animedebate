import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { authErrorMessage, getAuthRequestLocale, localizeAuthZodError } from "@/lib/auth/messages";
import { clientIp, jsonError, rateLimit } from "@/lib/http";
import { usernameSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const locale = getAuthRequestLocale(req);
  if (!rateLimit(`check-username:${clientIp(req)}`, 60, 60_000)) {
    return jsonError(authErrorMessage(locale, "tooManyCheck"), 429);
  }

  const raw = req.nextUrl.searchParams.get("username") ?? "";
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: true,
        valid: false,
        available: false,
        reason: localizeAuthZodError(parsed.error, locale),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { usernameKey: parsed.data.toLowerCase() },
    select: { id: true },
  });

  return NextResponse.json(
    {
      ok: true,
      valid: true,
      available: !existing,
      reason: existing ? authErrorMessage(locale, "usernameTaken") : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
