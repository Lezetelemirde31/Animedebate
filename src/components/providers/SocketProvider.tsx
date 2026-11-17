"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PresenceDTO, PresenceStats } from "@/game/types";
import { api, isNetworkFailure } from "@/lib/client-api";
import { useCurrentUser } from "./SessionProvider";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

interface QueueState {
  inQueue: boolean;
  since: number | null;
}

interface ActiveMatchState {
  code: string;
  phase: string;
}

interface SocketContextValue {
  status: ConnectionStatus;
  stats: PresenceStats | null;
  /** serverTime ≈ Date.now() + clockOffset */
  clockOffset: number;
  observeServerTime: (serverNow: number, rttMs?: number) => void;
  queue: QueueState;
  active: ActiveMatchState | null;
  refreshPresence: () => Promise<void>;
}

const SocketContext = createContext<SocketContextValue>({
  status: "connecting",
  stats: null,
  clockOffset: 0,
  observeServerTime: () => undefined,
  queue: { inQueue: false, since: null },
  active: null,
  refreshPresence: async () => undefined,
});

const IDLE_POLL_MS = 5_000;
const QUEUE_POLL_MS = 2_000;

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useCurrentUser();
  const userId = user?.id ?? null;

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [stats, setStats] = useState<PresenceStats | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [queue, setQueue] = useState<QueueState>({ inQueue: false, since: null });
  const [active, setActive] = useState<ActiveMatchState | null>(null);

  const routerRef = useRef(router);
  routerRef.current = router;
  const bestRttRef = useRef<number>(Infinity);
  const offsetRef = useRef<number>(0);
  const inQueueRef = useRef(false);
  inQueueRef.current = queue.inQueue;
  const wakeRef = useRef<() => Promise<void>>(async () => undefined);

  const observeServerTime = useCallback((serverNow: number, rttMs = 0) => {
    const safeRtt = Math.max(0, rttMs);
    const estimate = serverNow + safeRtt / 2 - Date.now();
    // Accept lower-RTT samples or update if clock drifted notably since last best sample
    if (safeRtt <= bestRttRef.current + 40 || Math.abs(estimate - offsetRef.current) > 2_000) {
      bestRttRef.current = Math.min(bestRttRef.current, safeRtt || 50);
      if (Math.abs(estimate - offsetRef.current) >= 40) {
        offsetRef.current = estimate;
        setClockOffset(estimate);
      }
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    let failures = 0;

    setStatus("connecting");
    setQueue({ inQueue: false, since: null });
    setActive(null);

    const schedule = () => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void poll(), inQueueRef.current ? QUEUE_POLL_MS : IDLE_POLL_MS);
    };

    const poll = async () => {
      if (stopped || busy) return;
      busy = true;
      const t0 = Date.now();
      const res = await api<PresenceDTO>("/api/live/presence");
      const rtt = Date.now() - t0;
      busy = false;
      if (stopped) return;

      if (res.ok) {
        failures = 0;
        setStatus("connected");
        observeServerTime(res.data.serverNow, rtt);
        setStats(res.data.stats);
        setActive(res.data.active);

        if (res.data.queue.matchedCode) {
          inQueueRef.current = false;
          setQueue({ inQueue: false, since: null });
          routerRef.current.push(`/room/${res.data.queue.matchedCode}`);
        } else {
          const nextQueue = {
            inQueue: res.data.queue.inQueue,
            since: res.data.queue.since,
          };
          inQueueRef.current = nextQueue.inQueue;
          setQueue(nextQueue);
        }
      } else if (isNetworkFailure(res) || res.code === "RATE_LIMITED" || res.code === "SERVER_ERROR") {
        if (++failures >= 2) setStatus("reconnecting");
      }

      schedule();
    };

    wakeRef.current = poll;

    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    void poll();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, observeServerTime]);

  const refreshPresence = useCallback(async () => {
    await wakeRef.current();
  }, []);

  const value = useMemo(
    () => ({ status, stats, clockOffset, observeServerTime, queue, active, refreshPresence }),
    [status, stats, clockOffset, observeServerTime, queue, active, refreshPresence],
  );

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
