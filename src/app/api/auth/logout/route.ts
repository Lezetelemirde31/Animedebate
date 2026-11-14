import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/tokens";
import { deleteSession } from "@/lib/auth/session-store";
import { clearSessionCookie } from "@/lib/auth/cookie";
import { isSecureRequest } from "@/lib/auth/server";
import { isSameOrigin, jsonError } from "@/lib/http";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, await isSecureRequest());
  return res;
}
