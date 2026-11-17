/**
 * Custom server: one Node process serves the Next.js app and the Socket.IO
 * real-time auction server on the same port.
 *
 *   npm run dev     — development (Next.js HMR + auto-restart of server code)
 *   npm run start   — production (after `npm run build`)
 */
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { RoomManager } from "./src/server/manager";
import { ArenaManager } from "./src/server/arena-manager";
import { attachSocketServer, type SocketData } from "./src/server/socket";
import type { ClientToServerEvents, ServerToClientEvents } from "./src/game/types";
import { prisma } from "./src/lib/db";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();
  const handleUpgrade = app.getUpgradeHandler();

  const httpServer = createServer((req, res) => {
    void handle(req, res);
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    path: "/socket.io",
    // Let Next.js handle its own websocket upgrades (HMR in development).
    destroyUpgrade: false,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    allowRequest: (req, callback) => {
      // Same-origin only: reject cross-site socket connections.
      const secFetchSite = (req.headers["sec-fetch-site"] as string | undefined)?.toLowerCase();
      if (secFetchSite === "same-origin") return callback(null, true);
      if (secFetchSite === "cross-site") return callback(null, false);

      const origin = req.headers.origin;
      if (!origin) return callback(null, true);
      try {
        const originUrl = new URL(origin);
        const originHost = originUrl.host.toLowerCase();
        const rawFwd = req.headers["x-forwarded-host"] as string | undefined;
        const candidates = [rawFwd, req.headers.host]
          .filter(Boolean)
          .flatMap((v) => v!.split(",").map((s) => s.trim().toLowerCase()))
          .filter(Boolean);
        if (candidates.includes(originHost)) return callback(null, true);

        const allInternal =
          candidates.length > 0 &&
          candidates.every(
            (h) => h.startsWith("localhost") || h.startsWith("127.0.0.1") || h.startsWith("0.0.0.0") || h.startsWith("[::1]"),
          );
        if (allInternal) {
          const referer = req.headers.referer;
          if (referer) {
            return callback(null, new URL(referer).origin.toLowerCase() === originUrl.origin.toLowerCase());
          }
          // WebSocket upgrade requests omit Referer; allow HTTPS / loopback origins behind local proxy.
          if (originUrl.protocol === "https:" || originHost.startsWith("localhost") || originHost.startsWith("127.0.0.1")) {
            return callback(null, true);
          }
        }
        callback(null, false);
      } catch {
        callback(null, false);
      }
    },
  });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/socket.io")) void handleUpgrade(req, socket, head);
  });

  const manager = new RoomManager();
  await manager.init();
  const arenaManager = new ArenaManager(manager.catalog);
  attachSocketServer(io, manager, arenaManager);

  httpServer.listen(port, hostname, () => {
    console.log(`▲ Anime Auction ready on http://localhost:${port} (${dev ? "development" : "production"})`);
    console.log(`  ${manager.catalog.size} playable characters loaded`);
  });

  const shutdown = async () => {
    arenaManager.shutdown();
    manager.shutdown();
    io.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
