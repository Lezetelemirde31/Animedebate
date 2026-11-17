"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DoorOpen, Globe, KeyRound, Plus, Radar, RefreshCw, Swords, Users, X, Zap } from "lucide-react";
import type { OpenRoomDTO } from "@/game/types";
import { api } from "@/lib/client-api";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { useSocket } from "@/components/providers/SocketProvider";
import { Avatar } from "@/components/ui/Avatar";
import { FormError, Spinner, StatTile } from "@/components/ui/primitives";
import { getAnime, ENABLED_ANIME_IDS } from "@/data/anime";
import { timeAgo } from "@/lib/utils";
import { JoinCodeForm } from "./JoinCodeForm";

function useElapsed(since: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [since]);
  if (!since) return "0:00";
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function PlayHub() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const { status, stats, queue, active, refreshPresence } = useSocket();
  const [rooms, setRooms] = useState<OpenRoomDTO[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(queue.inQueue ? queue.since : null);

  const loadRooms = useCallback(async () => {
    setRefreshing(true);
    const res = await api<OpenRoomDTO[]>("/api/live/rooms");
    setRefreshing(false);
    if (res.ok) setRooms(res.data);
    else setRooms((prev) => prev ?? []);
  }, []);

  useEffect(() => {
    void loadRooms();
    const id = setInterval(() => void loadRooms(), 5_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadRooms();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadRooms]);

  async function findMatch() {
    setPending(true);
    setError(null);
    try {
      const res = await api<{ matchedCode: string | null }>("/api/live/queue", { method: "POST" });
      if (!res.ok) {
        setError(res.message || t.play.queueError);
      } else if (res.data.matchedCode) {
        router.push(`/room/${res.data.matchedCode}`);
      } else {
        await refreshPresence();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.play.queueError);
    } finally {
      setPending(false);
    }
  }

  async function cancel() {
    await api("/api/live/queue", { method: "DELETE" });
    await refreshPresence();
  }

  const activeCode = active?.code ?? null;

  return (
    <div className="space-y-8">
      {activeCode && (
        <div className="glass-strong flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-500/40 px-5 py-3.5 neon-border animate-slide-up">
          <div className="flex items-center gap-2.5 text-sm text-purple-100">
            <DoorOpen className="h-5 w-5 shrink-0 text-purple-300" />
            <span>{t.play.activeRoomBanner(activeCode)}</span>
          </div>
          <Link href={`/room/${activeCode}`} className="btn btn-primary !py-2">
            {t.play.returnToRoom}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t.play.playersOnline} value={stats?.online ?? "—"} icon={Users} accent="green" />
        <StatTile label={t.play.inQueue} value={stats?.inQueue ?? "—"} icon={Radar} accent="purple" />
        <StatTile label={t.play.liveAuctions} value={stats?.liveMatches ?? "—"} icon={Swords} accent="red" />
        <StatTile label={t.play.openRooms} value={stats?.openRooms ?? "—"} icon={DoorOpen} accent="sky" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Quick match */}
        <div className="glass-strong relative overflow-hidden rounded-3xl p-6 neon-border lg:col-span-1 animate-slide-up">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-purple-600/35 blur-3xl" />
          <div className="relative flex h-full flex-col">
            <Zap className="h-8 w-8 text-purple-300" />
            <h2 className="mt-3 font-display text-2xl font-bold text-white">{t.play.quickMatch}</h2>
            <p className="mt-2 text-sm text-zinc-400">{t.play.quickMatchDesc}</p>
            <div className="mt-auto pt-6">
              {queue.inQueue ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4">
                    <div className="relative h-10 w-10">
                      <span className="absolute inset-0 animate-ping rounded-full bg-purple-500/40" />
                      <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-purple-600">
                        <Radar className="h-5 w-5 text-white" />
                      </span>
                    </div>
                    <div>
                      <div className="font-display font-semibold text-white" data-testid="queue-status">{t.play.searchingOpponent}</div>
                      <div className="font-display text-sm tabular-nums text-purple-200">{elapsed}</div>
                    </div>
                  </div>
                  <button className="btn btn-ghost w-full" onClick={cancel}>
                    <X className="h-4 w-4" /> {t.play.cancelSearch}
                  </button>
                </div>
              ) : (
                <>
                  <button className="btn btn-primary w-full !py-3.5 !text-base" onClick={findMatch} disabled={pending} data-testid="find-match">
                    {pending ? <Spinner className="h-4 w-4 text-white" /> : <Swords className="h-5 w-5" />}
                    {t.play.findMatch}
                  </button>
                  {status === "reconnecting" && (
                    <p className="mt-2 text-center text-xs text-amber-300">{t.play.connectingLiveServer}</p>
                  )}
                </>
              )}
              <FormError message={error} />
            </div>
          </div>
        </div>

        {/* Create */}
        <Link href="/play/create" className="glass group relative overflow-hidden rounded-3xl p-6 transition hover:border-purple-500/40 animate-slide-up" style={{ animationDelay: "80ms" }}>
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-rose-600/20 blur-3xl transition group-hover:bg-rose-600/30" />
          <Plus className="h-8 w-8 text-rose-300" />
          <h2 className="mt-3 font-display text-2xl font-bold text-white">{t.play.createRoom}</h2>
          <p className="mt-2 text-sm text-zinc-400">{t.play.createRoomDesc}</p>
          <span className="btn btn-ghost mt-6 w-full">{t.play.setupRoom}</span>
        </Link>

        {/* Join */}
        <div className="glass relative overflow-hidden rounded-3xl p-6 animate-slide-up" style={{ animationDelay: "160ms" }}>
          <KeyRound className="h-8 w-8 text-sky-300" />
          <h2 className="mt-3 font-display text-2xl font-bold text-white">{t.play.joinWithCode}</h2>
          <p className="mt-2 text-sm text-zinc-400">{t.play.joinWithCodeDesc}</p>
          <div className="mt-6">
            <JoinCodeForm compact />
          </div>
        </div>
      </div>

      {/* Collection Deck Arena Feature Banner */}
      <div className="glass-strong flex flex-col justify-between gap-4 rounded-3xl border border-purple-500/30 p-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-widest text-purple-300">
            <Swords className="h-4 w-4" /> {t.arena.eyebrow}
          </div>
          <h2 className="mt-1.5 font-display text-xl font-bold text-white">{t.play.deckArenaTitle}</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">{t.play.deckArenaDesc}</p>
        </div>
        <Link href="/arena" className="btn btn-primary min-h-[44px] whitespace-nowrap shrink-0">
          <Swords className="h-4 w-4" /> {t.play.deckArenaCta}
        </Link>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold text-white">
            <Globe className="h-5 w-5 text-purple-300" /> {t.play.openPublicRooms}
          </h2>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 sm:inline">{t.play.updatesLive}</span>
            <button
              type="button"
              onClick={() => void loadRooms()}
              disabled={refreshing}
              className="btn btn-ghost !px-3 !py-1.5 !text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {t.play.refreshRooms}
            </button>
          </div>
        </div>
        {rooms === null ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="glass rounded-2xl px-6 py-10 text-center text-sm text-zinc-400">
            {t.play.noPublicRooms}{" "}
            <Link href="/play/create" className="text-purple-300 hover:text-purple-200">
              {t.play.createOne}
            </Link>
            .
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rooms.map((r) => (
              <div key={r.code} className="glass flex items-center gap-4 rounded-2xl p-4 animate-slide-up">
                <Avatar username={r.host.username} style={r.host.avatar.style} imageUrl={r.host.avatar.imageUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display font-semibold text-white">{r.host.username}</span>
                    <span className="rounded bg-white/5 px-1.5 font-display text-[11px] tracking-widest text-zinc-400">{r.code}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    {t.play.teamShort(r.settings.teamSize ?? 5)} · {r.settings.bidSeconds}{t.auction.secLabel} ·{" "}
                    {r.settings.animeIds.length === ENABLED_ANIME_IDS.length
                      ? t.play.allAnime
                      : r.settings.animeIds.map((id) => getAnime(id)?.shortName ?? id).join(", ")}{" "}
                    · {timeAgo(r.createdAt, locale)}
                  </div>
                </div>
                <Link href={`/room/${r.code}`} className="btn btn-primary shrink-0 !px-4 !py-2">
                  {t.play.joinBtn}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
