import { NextResponse, type NextRequest } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * CSRF defence for state-changing requests: browsers always send Origin on
 * cross-site POST/PATCH, so it must match the host serving this request.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

const buckets = (globalThis as unknown as { __aaRate?: Map<string, { count: number; resetAt: number }> }).__aaRate ??
  new Map<string, { count: number; resetAt: number }>();
(globalThis as unknown as { __aaRate?: typeof buckets }).__aaRate = buckets;

/** Fixed-window limiter (per process) for auth endpoints. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
