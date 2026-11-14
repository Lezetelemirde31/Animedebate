import { PrismaClient } from "@prisma/client";

/**
 * Single PrismaClient per process. The custom server (Socket.IO) and the
 * Next.js route handlers are loaded through different module graphs, so the
 * instance is stored on globalThis to share one connection pool.
 */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.__prisma = prisma;
