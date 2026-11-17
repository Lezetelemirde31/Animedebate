"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { ArenaRoomSnapshot } from "@/game/types";
import { api, isNetworkFailure } from "@/lib/client-api";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { Spinner } from "@/components/ui/primitives";
import { ArenaBattleBoard } from "./ArenaBattleBoard";

const DECK_STORAGE_KEY = "anime_arena_deck_ids";

export function ArenaRoomClient({ code }: { code: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [snapshot, setSnapshot] = useState<ArenaRoomSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);

  const wakeRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let joined = false;
    let busy = false;
    let deckIds: string[] | undefined;

    try {
      const raw = sessionStorage.getItem(DECK_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length === 5) deckIds = parsed;
    } catch {
      deckIds = undefined;
    }

    const poll = async () => {
      if (stopped || busy) return;
      busy = true;
      const res = await api<ArenaRoomSnapshot>(`/api/arena/rooms/${code}`, {
        body: joined ? { action: "sync" } : { action: "join", deckIds },
      });
      busy = false;
      if (stopped) return;

      let nextPhase: ArenaRoomSnapshot["phase"] | null = null;
      if (res.ok) {
        joined = true;
        nextPhase = res.data.phase;
        setSnapshot(res.data);
        setLoadError(null);
      } else if (!isNetworkFailure(res) && res.code !== "RATE_LIMITED" && res.code !== "SERVER_ERROR") {
        setLoadError(res.message || t.arena.roomNotFound);
        return;
      }

      if (nextPhase !== "FINISHED" && nextPhase !== "ABANDONED") {
        const delay = nextPhase === "LOBBY" ? 1_500 : 850;
        timer = setTimeout(() => void poll(), delay);
      }
    };

    wakeRef.current = poll;
    void poll();

    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, t.arena.roomNotFound]);

  const handlePlayCard = useCallback(
    async (cardId: string) => {
      setPendingCardId(cardId);
      setActionError(null);
      try {
        const res = await api<ArenaRoomSnapshot>(`/api/arena/rooms/${code}`, {
          body: { action: "play", cardId },
        });
        if (!res.ok) setActionError(res.message || t.errors.wrongDesc);
        else {
          setSnapshot(res.data);
          void wakeRef.current();
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t.errors.wrongDesc);
      } finally {
        setPendingCardId(null);
      }
    },
    [code, t.errors.wrongDesc],
  );

  const handleLeave = useCallback(async () => {
    await api(`/api/arena/rooms/${code}`, { body: { action: "leave" } }).catch(() => undefined);
    router.push("/arena");
  }, [code, router]);

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
