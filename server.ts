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
      const origin = req.headers.origin;
      if (!origin) return callback(null, true);
      const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host;
      try {
        callback(null, new URL(origin).host === host);
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
  attachSocketServer(io, manager);

  httpServer.listen(port, hostname, () => {
    console.log(`▲ Anime Auction ready on http://localhost:${port} (${dev ? "development" : "production"})`);
    console.log(`  ${manager.catalog.size} playable characters loaded`);
  });

  const shutdown = async () => {
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
