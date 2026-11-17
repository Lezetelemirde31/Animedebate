"use client";

/**
 * Live connection to the game server over plain HTTP polling, so it works on
 * every host — including serverless ones such as Vercel, which cannot keep
 * WebSocket connections open. (The file keeps its historical name.)
 *
 * Provides site stats, the player's matchmaking status and live match, and a
 * server-clock offset used by every countdown.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PresenceDTO, PresenceStats } from "@/game/types";
import { api } from "@/lib/client-api";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

interface LiveContextValue {
  status: ConnectionStatus;
  stats: PresenceStats | null;
  queue: { inQueue: boolean; since: number | null };
  /** The started match the signed-in user is playing in, if any. */
  active: PresenceDTO["active"];
  /** serverTime ≈ Date.now() + clockOffset */
  clockOffset: number;
  /** Ask the server for fresh presence data now (e.g. after joining the queue). */
  refresh: () => void;
  /** Feed a server timestamp from any API answer to keep the clock in sync. */
  observeServerTime: (serverNow: number, roundTripMs: number) => void;
}

const LiveContext = createContext<LiveContextValue>({
  status: "connecting",
  stats: null,
  queue: { inQueue: false, since: null },
  active: null,
  clockOffset: 0,
  refresh: () => undefined,
  observeServerTime: () => undefined,
});

const IDLE_INTERVAL_MS = 8_000;
const QUEUE_INTERVAL_MS = 1_500;

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [data, setData] = useState<PresenceDTO | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const bestRtt = useRef(Number.POSITIVE_INFINITY);
  const offsetRef = useRef(0);
  const inQueueRef = useRef(false);
  const kick = useRef<() => void>(() => undefined);

  const observeServerTime = useCallback((serverNow: number, roundTripMs: number) => {
    // Keep the sample with the shortest round trip; let it age so drift gets corrected.
    bestRtt.current += 2;
    if (roundTripMs > bestRtt.current) return;
    bestRtt.current = roundTripMs;
    const offset = serverNow + roundTripMs / 2 - Date.now();
    if (Math.abs(offset - offsetRef.current) > 40) {
      offsetRef.current = offset;
      setClockOffset(offset);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let running = false;

    const tick = async () => {
      if (stopped || running) return;
      running = true;
      if (timer) clearTimeout(timer);
      const t0 = Date.now();
      const res = await api<PresenceDTO>("/api/live/presence");
      running = false;
      if (stopped) return;
      if (res.ok) {
        failures = 0;
        setStatus("connected");
        observeServerTime(res.data.serverNow, Date.now() - t0);
        inQueueRef.current = res.data.queue.inQueue;
        setData(res.data);
        if (res.data.queue.matchedCode) routerRef.current.push(`/room/${res.data.queue.matchedCode}`);
      } else if (++failures >= 2) {
        setStatus("reconnecting");
      }
      if (document.visibilityState === "visible") {
        timer = setTimeout(tick, inQueueRef.current ? QUEUE_INTERVAL_MS : IDLE_INTERVAL_MS);
      }
    };
    kick.current = () => void tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [observeServerTime]);

  const refresh = useCallback(() => kick.current(), []);

  const value = useMemo<LiveContextValue>(
    () => ({
      status,
      stats: data?.stats ?? null,
      queue: { inQueue: data?.queue.inQueue ?? false, since: data?.queue.since ?? null },
      active: data?.active ?? null,
      clockOffset,
      refresh,
      observeServerTime,
    }),
    [status, data, clockOffset, refresh, observeServerTime],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useSocket(): LiveContextValue {
  return useContext(LiveContext);
}

/** Returns a function giving the current server time. */
export function useServerClock(): () => number {
  const { clockOffset } = useSocket();
  return useCallback(() => Date.now() + clockOffset, [clockOffset]);
}
