"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Ack, ErrorCode, RoomEvent, RoomSnapshot } from "@/game/types";
import { emitWithAck, useServerClock, useSocket } from "@/components/providers/SocketProvider";

export type RoomEventWithMeta = RoomEvent & { code: string; at: number; key: number };

export interface RoomError {
  code: ErrorCode | "CLIENT";
  message: string;
  data?: { code?: string; matchId?: string };
}

let eventKey = 0;

/** Subscribes to a room: joins over the socket, keeps the snapshot in sync and exposes actions. */
export function useRoom(code: string) {
  const router = useRouter();
  const { socket, status } = useSocket();
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<RoomError | null>(null);
  const [joining, setJoining] = useState(true);
  const [events, setEvents] = useState<RoomEventWithMeta[]>([]);
  const versionRef = useRef(-1);
  const listeners = useRef(new Set<(e: RoomEventWithMeta) => void>());

  useEffect(() => {
    if (!socket) return;
    const onState = (s: RoomSnapshot) => {
      if (s.code !== code || s.version <= versionRef.current) return;
      versionRef.current = s.version;
      setSnapshot(s);
    };
    const onEvent = (e: RoomEvent & { code: string; at: number }) => {
      if (e.code !== code) return;
      const withKey = { ...e, key: ++eventKey } as RoomEventWithMeta;
      setEvents((list) => [...list.slice(-30), withKey]);
      listeners.current.forEach((l) => l(withKey));
    };
    const onRedirect = ({ from, to }: { from: string; to: string }) => {
      if (from === code) router.push(`/room/${to}`);
    };
    const join = () => {
      setJoining(true);
      socket.emit("room:join", { code }, (res: Ack<RoomSnapshot>) => {
        setJoining(false);
        if (res.ok) {
          versionRef.current = res.data.version;
          setSnapshot(res.data);
          setError(null);
        } else {
          setError({ code: res.code, message: res.message, data: res.data });
        }
      });
    };
    socket.on("room:state", onState);
    socket.on("room:event", onEvent);
    socket.on("room:redirect", onRedirect);
    socket.on("connect", join);
    if (socket.connected) join();
    return () => {
      socket.off("room:state", onState);
      socket.off("room:event", onEvent);
      socket.off("room:redirect", onRedirect);
      socket.off("connect", join);
      // Navigating away keeps the seat; only an explicit "leave" gives it up.
      if (socket.connected) socket.emit("room:detach", { code }, () => undefined);
    };
  }, [socket, code, router]);

  const call = useCallback(
    async <T,>(send: Parameters<typeof emitWithAck<Ack<T>>>[1]): Promise<Ack<T>> => {
      try {
        return await emitWithAck<Ack<T>>(socket, send);
      } catch (err) {
        return { ok: false, code: "SERVER_ERROR", message: err instanceof Error ? err.message : "Request failed." } as Ack<T>;
      }
    },
    [socket],
  );

  const bid = useCallback(
    (lotId: string, amount: number) =>
      call<{ amount: number }>((s, ack) => s.emit("auction:bid", { code, lotId, amount }, ack as never)),
    [call, code],
  );
  const setReady = useCallback(
    (ready: boolean) => call((s, ack) => s.emit("room:ready", { code, ready }, ack as never)),
    [call, code],
  );
  const leave = useCallback(() => call((s, ack) => s.emit("room:leave", { code }, ack as never)), [call, code]);
  const rematch = useCallback(() => call((s, ack) => s.emit("room:rematch", { code }, ack as never)), [call, code]);

  const onEvent = useCallback((fn: (e: RoomEventWithMeta) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  return { snapshot, error, joining, connection: status, events, bid, setReady, leave, rematch, onEvent };
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
