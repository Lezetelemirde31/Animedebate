import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./tokens";
import { getUserBySessionToken, type SessionUser } from "./session-store";
import { PREVIEW_COOKIE, previewModeActive, restorePreviewSession } from "./preview-session";

/** Returns the signed-in user for the current request (server components / route handlers). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);
  if (user || !token || !previewModeActive()) return user;
  // Demo mode (no database): this server instance may not have seen the account yet.
  const restored = await restorePreviewSession(token, store.get(PREVIEW_COOKIE)?.value);
  return restored ? getUserBySessionToken(token) : null;
});

/** Like getCurrentUser but redirects to the login page when signed out. */
export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/** Requires ADMIN or MODERATOR role on server pages. */
export async function requireAdmin(nextPath = "/admin"): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (user.role !== "ADMIN" && user.role !== "MODERATOR") {
    redirect("/");
  }
  return user;
}

export function isStaff(user: SessionUser | null | undefined): boolean {
  return user?.role === "ADMIN" || user?.role === "MODERATOR";
}

/** Whether the current request arrived over HTTPS (directly or via a proxy). */
export async function isSecureRequest(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return process.env.COOKIE_SECURE === "true";
}
