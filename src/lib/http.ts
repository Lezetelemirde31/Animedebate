import { NextResponse, type NextRequest } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * CSRF defence for state-changing requests: browsers always send Origin on
 * cross-site POST/PATCH and modern browsers send unspoofable Sec-Fetch-Site.
 * Behind reverse proxies (Cloud Run, AI Studio, Vercel), internal Host may
 * differ from public Origin when x-forwarded-host is omitted or chained.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const secFetchSite = req.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "same-origin") return true;
  if (secFetchSite === "cross-site") return false;

  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const originHost = originUrl.host.toLowerCase();

  const candidates = [
    req.headers.get("x-forwarded-host"),
    req.headers.get("host"),
    req.nextUrl.host,
  ]
    .filter(Boolean)
    .flatMap((v) => v!.split(",").map((s) => s.trim().toLowerCase()))
    .filter(Boolean);

  if (candidates.includes(originHost)) return true;

  const allInternal =
    candidates.length > 0 &&
    candidates.every(
      (h) => h.startsWith("localhost") || h.startsWith("127.0.0.1") || h.startsWith("0.0.0.0") || h.startsWith("[::1]"),
    );
  const referer = req.headers.get("referer");
  if (allInternal && referer) {
    try {
      return new URL(referer).origin.toLowerCase() === originUrl.origin.toLowerCase();
    } catch {
      return false;
    }
  }

  return false;
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
