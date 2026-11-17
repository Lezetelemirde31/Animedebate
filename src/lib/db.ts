import net from "node:net";
import { PrismaClient } from "@prisma/client";
import { createPreviewPrisma } from "./preview-store";

/**
 * Single PrismaClient per process.
 * Supports DATABASE_URL as well as Vercel/Supabase integration fallbacks
 * (POSTGRES_PRISMA_URL, POSTGRES_URL).
 * When no database URL is configured (or a local localhost:5432 URL is injected
 * without a running PostgreSQL instance), falls back safely to the in-memory preview store.
 */
const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
  __aaWarnedNoDb?: boolean;
};

export function getDatabaseUrl(): string | null {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    "";
  return url ? withAppDatabaseName(url) : null;
}

/**
 * APP_DATABASE_NAME lets this app use its own database on a shared Postgres
 * server (e.g. a Neon project that another app also uses): the connection
 * string from the hosting integration is kept, only the database name changes.
 */
export function withAppDatabaseName(url: string): string {
  const name = process.env.APP_DATABASE_NAME?.trim();
  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) return url;
  try {
    const parsed = new URL(url);
    parsed.pathname = `/${name}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

function parseLocalTarget(url: string): { host: string; port: number } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1") {
      return { host: parsed.hostname === "::1" ? "127.0.0.1" : parsed.hostname, port: Number(parsed.port || 5432) };
    }
    return null;
  } catch {
    return null;
  }
}

function canConnectTcp(host: string, port: number, timeoutMs = 600): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function createLocalResilientPrisma(url: string, target: { host: string; port: number }): PrismaClient {
  let resolvedPromise: Promise<PrismaClient> | null = null;
  const resolveClient = (): Promise<PrismaClient> => {
    if (!resolvedPromise) {
      resolvedPromise = canConnectTcp(target.host, target.port).then((reachable) => {
        if (reachable) {
          return new PrismaClient({
            datasources: { db: { url } },
            log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
          });
        }
        if (!globalForPrisma.__aaWarnedNoDb) {
          globalForPrisma.__aaWarnedNoDb = true;
          console.warn(
            `[db] PostgreSQL at ${target.host}:${target.port} is not reachable — running in in-memory preview mode.`,
          );
        }
        return createPreviewPrisma();
      });
    }
    return resolvedPromise;
  };

  return new Proxy({} as PrismaClient, {
    get(_t, prop: string | symbol) {
      if (prop === "then") return undefined;
      if (typeof prop === "symbol") return undefined;
      if (prop.startsWith("$")) {
        return (...args: unknown[]) =>
          resolveClient().then((c) => {
            const fn = (c as unknown as Record<string, unknown>)[prop];
            if (typeof fn === "function") return (fn as (...a: unknown[]) => unknown).apply(c, args);
            return undefined;
          });
      }
      return new Proxy(
        {},
        {
          get(_m, method: string | symbol) {
            if (typeof method === "symbol") return undefined;
            return (...args: unknown[]) =>
              resolveClient().then((c) => {
                const delegate = (c as unknown as Record<string, Record<string, unknown>>)[prop];
                const fn = delegate?.[method];
                if (typeof fn === "function") return (fn as (...a: unknown[]) => unknown).apply(delegate, args);
                throw new Error(`Unknown Prisma method ${prop}.${method}`);
              });
          },
        },
      );
    },
  });
}

function initClient(): PrismaClient {
  const url = getDatabaseUrl();
  if (!url) {
    if (!globalForPrisma.__aaWarnedNoDb) {
      globalForPrisma.__aaWarnedNoDb = true;
      console.warn("[db] DATABASE_URL is not set — running in in-memory preview mode. Set DATABASE_URL in .env for persistent PostgreSQL/Supabase.");
    }
    return createPreviewPrisma();
  }
  const localTarget = parseLocalTarget(url);
  if (localTarget) {
    return createLocalResilientPrisma(url, localTarget);
  }
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.__prisma ?? initClient();
globalForPrisma.__prisma = prisma;
