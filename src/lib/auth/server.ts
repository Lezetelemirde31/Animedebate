import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./tokens";
import { getUserBySessionToken, type SessionUser } from "./session-store";

/** Returns the signed-in user for the current request (server components / route handlers). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getUserBySessionToken(store.get(SESSION_COOKIE)?.value);
}

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
