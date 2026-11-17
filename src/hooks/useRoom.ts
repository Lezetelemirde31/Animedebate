"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Ack, ErrorCode, RoomAction, RoomEvent, RoomSnapshot } from "@/game/types";
import { GAME_RULES } from "@/game/config";
import { api, isNetworkFailure } from "@/lib/client-api";
import { useServerClock, useSocket, type ConnectionStatus } from "@/components/providers/SocketProvider";

export type RoomEventWithMeta = RoomEvent & { code: string; at: number; key: number };

export interface RoomError {
  code: ErrorCode | "CLIENT";
  message: string;
  data?: { code?: string; matchId?: string };
}

let eventKey = 0;

/** The latest bid landed late enough to reset the clock (overtime). */
function isOvertimeBid(snapshot: RoomSnapshot): boolean {
  const lot = snapshot.currentLot;
  const last = lot?.bids.at(-1);
  return !!lot && !!last && lot.endsAt !== null && lot.endsAt - last.at === snapshot.settings.overtimeSeconds * 1000;
}

/** What changed between two snapshots, for the toast notifications. */
function diffEvents(prev: RoomSnapshot, next: RoomSnapshot): RoomEvent[] {
  const events: RoomEvent[] = [];
  const before = new Map(prev.players.map((p) => [p.userId, p]));
  const after = new Map(next.players.map((p) => [p.userId, p]));
  for (const p of next.players) {
    const old = before.get(p.userId);
    if (!old) events.push({ type: "player_joined", userId: p.userId, username: p.username });
    else if (old.connected && !p.connected) events.push({ type: "player_disconnected", userId: p.userId, username: p.username });
    else if (!old.connected && p.connected) events.push({ type: "player_reconnected", userId: p.userId, username: p.username });
  }
  if (next.phase === "LOBBY") {
    for (const p of prev.players) {
      if (!after.has(p.userId)) events.push({ type: "player_left", userId: p.userId, username: p.username });
    }
  }
  if (prev.phase !== "PAUSED" && next.phase === "PAUSED") events.push({ type: "match_paused", userId: "" });
  if (prev.phase === "PAUSED" && ["COUNTDOWN", "BIDDING", "INTERMISSION"].includes(next.phase)) events.push({ type: "match_resumed" });
  const lot = next.currentLot;
  const last = lot?.bids.at(-1);
  const prevLast = prev.currentLot?.id === lot?.id ? prev.currentLot?.bids.at(-1) : undefined;
  if (lot && last && last.id !== prevLast?.id) events.push({ type: "bid", bid: last, overtime: isOvertimeBid(next) });
  return events;
}

/** How long to wait before asking the server again. */
function pollDelay(snapshot: RoomSnapshot | null): number | null {
  if (!snapshot) return GAME_RULES.pollIntervalMs;
  switch (snapshot.phase) {
    case "LOBBY":
      return 1_500;
    case "FINISHED":
      return snapshot.rematchCode ? null : 2_500;
    case "ABANDONED":
      return null;
    default:
      return GAME_RULES.pollIntervalMs;
  }
}

/**
 * Keeps one auction room in sync over HTTP: joins, then regularly asks the
 * server for the authoritative state (each request also tells the server this
 * player is still here). Actions return the new state at once.
 */
export function useRoom(code: string) {
  const router = useRouter();
  const { observeServerTime } = useSocket();
  const clock = useServerClock();
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<RoomError | null>(null);
  const [joining, setJoining] = useState(true);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [events, setEvents] = useState<RoomEventWithMeta[]>([]);

  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const seq = useRef(0);
  const applied = useRef(0);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const wake = useRef<() => void>(() => undefined);

  const apply = useCallback(
    (next: RoomSnapshot, requestSeq: number) => {
      // Ignore answers that arrive out of order.
      if (requestSeq < applied.current) return;
      const prev = snapshotRef.current;
      if (prev && next.version < prev.version) return;
      applied.current = requestSeq;
      if (prev) {
        const fresh = diffEvents(prev, next).map((e) => ({ ...e, code, at: Date.now(), key: ++eventKey }) as RoomEventWithMeta);
        if (fresh.length) setEvents((list) => [...list.slice(-20), ...fresh]);
      }
      snapshotRef.current = next;
      setSnapshot(next);
      if (next.rematchCode && next.players.some((p) => p.userId)) router.push(`/room/${next.rematchCode}`);
    },
    [code, router],
  );

  const send = useCallback(
    async (action: RoomAction): Promise<Ack<RoomSnapshot>> => {
      const mySeq = ++seq.current;
      const t0 = Date.now();
      const res = await api<RoomSnapshot>(`/api/live/rooms/${code}`, { body: action });
      if (res.serverNow) observeServerTime(res.serverNow, Date.now() - t0);
      if (res.ok) apply(res.data, mySeq);
      return res;
    },
    [code, apply, observeServerTime],
  );

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let joined = false;
    let busy = false;
    snapshotRef.current = null;
    applied.current = 0;
    setSnapshot(null);
    setError(null);
    setEvents([]);
    setJoining(true);
    setConnection("connecting");

    const schedule = () => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      const snap = snapshotRef.current;
      let delay = pollDelay(snap);
      if (delay === null) return;
      // Look again right after a known deadline instead of waiting a full interval.
      const deadline = snap?.phase === "BIDDING" ? snap.currentLot?.endsAt : snap?.phaseEndsAt;
      if (deadline) {
        const untilDeadline = deadline - clockRef.current() + 150;
        if (untilDeadline > 0 && untilDeadline < delay) delay = untilDeadline;
      }
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (stopped || busy) return;
      busy = true;
      const res = await send({ action: joined ? "sync" : "join" });
      busy = false;
      if (stopped) return;
      if (res.ok) {
        joined = true;
        failures = 0;
        setJoining(false);
        setConnection("connected");
        setError(null);
      } else if (isNetworkFailure(res) || res.code === "RATE_LIMITED" || res.code === "SERVER_ERROR") {
        if (++failures >= 2) setConnection("reconnecting");
      } else {
        setJoining(false);
        setError({ code: res.code, message: res.message, data: res.data });
        return; // nothing to keep in sync
      }
      schedule();
    };
    wake.current = () => void tick();

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
  }, [code, send]);

  const act = useCallback(
    async (action: RoomAction): Promise<Ack<RoomSnapshot>> => {
      const res = await send(action);
      wake.current();
      return res;
    },
    [send],
  );

  const bid = useCallback((lotId: string, amount: number) => act({ action: "bid", lotId, amount }), [act]);
  const setReady = useCallback((ready: boolean) => act({ action: "ready", ready }), [act]);
  const leave = useCallback(() => send({ action: "leave" }), [send]);
  const rematch = useCallback(() => act({ action: "rematch" }), [act]);

  return { snapshot, error, joining, connection, events, bid, setReady, leave, rematch };
}

/** Re-renders at the given interval and returns the current server time. */
export function useServerNow(intervalMs = 100): number {
  const clock = useServerClock();
  const [now, setNow] = useState(() => clock());
  useEffect(() => {
    setNow(clock());
    const id = setInterval(() => setNow(clock()), intervalMs);
    return () => clearInterval(id);
  }, [clock, intervalMs]);
  return now;
}
