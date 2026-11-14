import type { NextResponse } from "next/server";
import { SESSION_COOKIE } from "./tokens";

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
