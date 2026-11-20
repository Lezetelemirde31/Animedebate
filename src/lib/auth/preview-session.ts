/**
 * Demo-mode sign-in that survives serverless hosting.
 *
 * Without a database the app keeps data in memory, and on hosts such as
 * Vercel every route can run in a different server instance with its own
 * memory. An account created by the register API would therefore be unknown
 * to the page that renders next, and the visitor would be bounced back to the
 * login page.
 *
 * To keep sign-in working in demo mode, the account is also stored in a
 * signed, httpOnly cookie. Any instance that does not know the account yet
 * restores it from that cookie. This is ONLY used when no database is
 * configured; with a real database it is never read or written.
 */
import crypto from "node:crypto";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { SESSION_TTL_MS, hashToken } from "./tokens";

export const PREVIEW_COOKIE = "aa_preview_user";

interface PreviewAccount {
  id: string;
  username: string;
  usernameKey: string;
  passwordHash: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  avatarStyle: string;
  createdAt: string;
  /** Hash of the session token this cookie belongs to. */
  sid: string;
}

function secret(): string {
  // Demo data only: a dedicated secret is optional.
  return process.env.SESSION_SECRET || process.env.VERCEL_PROJECT_ID || "anime-debate-demo-mode";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function previewModeActive(): boolean {
  return !isDatabaseConfigured();
}

export function encodePreviewAccount(
  user: { id: string; username: string; usernameKey: string; passwordHash: string; role: string; avatarStyle: string; createdAt: Date | string },
  sessionToken: string,
): string {
  const account: PreviewAccount = {
    id: user.id,
    username: user.username,
    usernameKey: user.usernameKey,
    passwordHash: user.passwordHash,
    role: user.role as PreviewAccount["role"],
    avatarStyle: user.avatarStyle,
    createdAt: new Date(user.createdAt).toISOString(),
    sid: hashToken(sessionToken),
  };
  const payload = Buffer.from(JSON.stringify(account)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(value: string | undefined | null): PreviewAccount | null {
  if (!value || value.length > 4000) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const account = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PreviewAccount;
    if (typeof account.id !== "string" || typeof account.usernameKey !== "string" || typeof account.passwordHash !== "string") return null;
    return account;
  } catch {
    return null;
  }
}

/** Makes sure this server instance knows the account stored in the cookie. Returns its username key. */
async function restoreAccount(account: PreviewAccount): Promise<boolean> {
  const existing = await prisma.user.findUnique({ where: { id: account.id } });
  if (existing) return true;
  // Never overwrite a different account that already uses this name here.
  const sameName = await prisma.user.findUnique({ where: { usernameKey: account.usernameKey } });
  if (sameName) return false;
  await prisma.user.create({
    data: {
      id: account.id,
      username: account.username,
      usernameKey: account.usernameKey,
      passwordHash: account.passwordHash,
      // Staff rights are never restored from a cookie.
      role: "USER",
      avatarStyle: account.avatarStyle,
      createdAt: new Date(account.createdAt),
    },
  });
  return true;
}

/**
 * Demo mode: if this instance does not know the visitor's session, restore
 * the account and session from the signed cookie.
 */
export async function restorePreviewSession(sessionToken: string | undefined, cookieValue: string | undefined): Promise<boolean> {
  if (!previewModeActive() || !sessionToken) return false;
  const account = decode(cookieValue);
  if (!account || account.sid !== hashToken(sessionToken)) return false;
  if (!(await restoreAccount(account))) return false;
  const tokenHash = hashToken(sessionToken);
  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session) {
    await prisma.session.create({ data: { tokenHash, userId: account.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  }
  return true;
}

/** Demo mode: lets someone sign in again on an instance that has not seen their account yet. */
export async function restorePreviewAccountForLogin(usernameKey: string, cookieValue: string | undefined): Promise<void> {
  if (!previewModeActive()) return;
  const account = decode(cookieValue);
  if (account && account.usernameKey === usernameKey) await restoreAccount(account);
}
