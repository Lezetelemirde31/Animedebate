"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, PresenceStats, ServerToClientEvents } from "@/game/types";
import { useCurrentUser } from "./SessionProvider";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

interface SocketContextValue {
  socket: AppSocket | null;
  status: ConnectionStatus;
  stats: PresenceStats | null;
  /** serverTime ≈ Date.now() + clockOffset */
  clockOffset: number;
  queue: { inQueue: boolean; since: number | null };
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  status: "connecting",
  stats: null,
  clockOffset: 0,
  queue: { inQueue: false, since: null },
});

/** Estimates the server clock offset using the lowest-latency of a few round trips. */
async function syncClock(socket: AppSocket): Promise<number> {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    const serverNow = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      socket.emit("time:sync", t0, (now) => {
        clearTimeout(timer);
        resolve(now);
      });
    });
    if (serverNow === null) continue;
    const t1 = Date.now();
    const rtt = t1 - t0;
    const offset = serverNow + rtt / 2 - t1;
    if (!best || rtt < best.rtt) best = { rtt, offset };
  }
  return best?.offset ?? 0;
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useCurrentUser();
  const userId = user?.id ?? null;
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [stats, setStats] = useState<PresenceStats | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [queue, setQueue] = useState<{ inQueue: boolean; since: number | null }>({ inQueue: false, since: null });
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DISABLE_SOCKET === "1") {
      setStatus("reconnecting");
      return;
    }
    setStatus("connecting");
    setQueue({ inQueue: false, since: null });

    const s: AppSocket = io({
      path: "/socket.io",
      transports: ["polling", "websocket"],
      withCredentials: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      timeout: 10_000,
    });
    setSocket(s);
    s.on("connect", () => {
      setStatus("connected");
      void syncClock(s).then(setClockOffset);
    });
    s.on("connect_error", () => setStatus("reconnecting"));
    s.on("disconnect", () => setStatus("reconnecting"));
    s.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    s.io.on("reconnect_failed", () => setStatus("reconnecting"));
    s.on("presence:stats", setStats);
    s.on("queue:status", setQueue);
    s.on("queue:matched", ({ code }) => {
      setQueue({ inQueue: false, since: null });
      routerRef.current.push(`/room/${code}`);
    });
    const resync = setInterval(() => {
      if (s.connected) void syncClock(s).then(setClockOffset);
    }, 60_000);
    return () => {
      clearInterval(resync);
      s.removeAllListeners();
      s.disconnect();
    };
  }, [userId]);

  const value = useMemo(() => ({ socket, status, stats, clockOffset, queue }), [socket, status, stats, clockOffset, queue]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

/** Returns a function giving the current server time. */
export function useServerClock(): () => number {
  const { clockOffset } = useSocket();
  return useCallback(() => Date.now() + clockOffset, [clockOffset]);
}

/** Promise wrapper around an acknowledged emit, with a timeout. */
export function emitWithAck<R>(
  socket: AppSocket | null,
  send: (s: AppSocket, ack: (res: R) => void) => void,
  timeoutMs = 8000,
): Promise<R> {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error("Not connected to the game server yet. Please wait a moment."));
      return;
    }
    const timer = setTimeout(() => reject(new Error("The server did not respond in time.")), timeoutMs);
    send(socket, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}
