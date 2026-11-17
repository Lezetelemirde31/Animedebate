"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { Ack, ArenaRoomSnapshot } from "@/game/types";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { emitWithAck, useSocket } from "@/components/providers/SocketProvider";
import { Spinner } from "@/components/ui/primitives";
import { ArenaBattleBoard } from "./ArenaBattleBoard";

const DECK_STORAGE_KEY = "anime_arena_deck_ids";

export function ArenaRoomClient({ code }: { code: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { socket, status } = useSocket();
  const [snapshot, setSnapshot] = useState<ArenaRoomSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    const onState = (next: ArenaRoomSnapshot) => {
      if (next.code === code) setSnapshot(next);
    };
    socket.on("arena:state", onState);
    return () => {
      socket.off("arena:state", onState);
    };
  }, [socket, code]);

  useEffect(() => {
    if (!socket || status !== "connected") return;
    let cancelled = false;
    let deckIds: string[] | undefined;
    try {
      const raw = sessionStorage.getItem(DECK_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length === 5) deckIds = parsed;
    } catch {
      deckIds = undefined;
    }

    emitWithAck<Ack<ArenaRoomSnapshot>>(socket, (s, ack) =>
      s.emit("arena:join", { code, deckIds }, ack as never),
    )
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setSnapshot(res.data);
          setLoadError(null);
        } else {
          setLoadError(res.message);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : t.arena.roomNotFound);
      });

    return () => {
      cancelled = true;
    };
  }, [socket, status, code, t.arena.roomNotFound]);

  const handlePlayCard = useCallback(
    async (cardId: string) => {
      if (!socket) return;
      setPendingCardId(cardId);
      setActionError(null);
      try {
        const res = await emitWithAck<Ack<ArenaRoomSnapshot>>(socket, (s, ack) =>
          s.emit("arena:play", { code, cardId }, ack as never),
        );
        if (!res.ok) setActionError(res.message);
        else setSnapshot(res.data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t.errors.wrongDesc);
      } finally {
        setPendingCardId(null);
      }
    },
    [socket, code, t.errors.wrongDesc],
  );

  const handleLeave = useCallback(async () => {
    if (socket && status === "connected") {
      await emitWithAck<Ack>(socket, (s, ack) =>
        s.emit("arena:leave", { code }, ack as never),
      ).catch(() => undefined);
    }
    router.push("/arena");
  }, [socket, status, code, router]);

  if (loadError) {
    return (
      <div className="glass-strong mx-auto max-w-lg rounded-3xl border border-rose-500/30 p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-rose-400" />
        <h2 className="mt-4 font-display text-xl font-bold text-white">{t.arena.roomNotFound}</h2>
        <p className="mt-2 text-sm text-zinc-400">{loadError}</p>
        <Link href="/arena" className="btn btn-primary mt-6 inline-flex">
          {t.arena.backToBuilder}
        </Link>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="glass-strong mx-auto max-w-lg rounded-3xl border border-white/10 p-10 text-center">
        <Spinner className="mx-auto h-8 w-8 text-purple-400" />
        <p className="mt-4 text-sm text-zinc-300">{t.arena.connecting}</p>
      </div>
    );
  }

  return (
    <ArenaBattleBoard
      snapshot={snapshot}
      onPlayCard={(cardId) => void handlePlayCard(cardId)}
      onLeave={() => void handleLeave()}
      pendingCardId={pendingCardId}
      error={actionError}
    />
  );
}
