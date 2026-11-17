import type { NextResponse } from "next/server";
import { SESSION_COOKIE } from "./tokens";
import { PREVIEW_COOKIE } from "./preview-session";

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date, secure: boolean) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: NextResponse, secure: boolean) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
}

/** Demo mode only (no database): keeps the account in a signed cookie. See preview-session.ts. */
export function setPreviewCookie(res: NextResponse, value: string, expiresAt: Date, secure: boolean) {
  res.cookies.set(PREVIEW_COOKIE, value, { httpOnly: true, sameSite: "lax", secure, path: "/", expires: expiresAt });
}
