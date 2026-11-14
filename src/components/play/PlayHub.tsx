"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DoorOpen, Globe, KeyRound, Plus, Radar, Swords, Users, X, Zap } from "lucide-react";
import type { Ack, OpenRoomDTO } from "@/game/types";
import { emitWithAck, useSocket } from "@/components/providers/SocketProvider";
import { Avatar } from "@/components/ui/Avatar";
import { FormError, Spinner, StatTile } from "@/components/ui/primitives";
import { getAnime } from "@/data/anime";
import { ENABLED_ANIME_IDS } from "@/data/anime";
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
  const { socket, status, stats, queue } = useSocket();
  const [rooms, setRooms] = useState<OpenRoomDTO[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(queue.inQueue ? queue.since : null);

  useEffect(() => {
    if (!socket || status !== "connected") return;
    socket.emit("rooms:list", (res: Ack<OpenRoomDTO[]>) => {
      if (res.ok) setRooms(res.data);
      else setRooms([]);
    });
    const onUpdate = (list: OpenRoomDTO[]) => setRooms(list);
    socket.on("rooms:updated", onUpdate);
    return () => {
      socket.off("rooms:updated", onUpdate);
    };
  }, [socket, status]);

  async function findMatch() {
    setPending(true);
    setError(null);
    try {
      const res = await emitWithAck<Ack<{ matchedCode: string | null }>>(socket, (s, ack) => s.emit("queue:join", ack as never));
      if (!res.ok) setError(res.message);
      else if (res.data.matchedCode) router.push(`/room/${res.data.matchedCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the queue.");
    } finally {
      setPending(false);
    }
  }

  async function cancel() {
    await emitWithAck<Ack>(socket, (s, ack) => s.emit("queue:leave", ack as never)).catch(() => undefined);
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Players online" value={stats?.online ?? "—"} icon={Users} accent="green" />
        <StatTile label="In queue" value={stats?.inQueue ?? "—"} icon={Radar} accent="purple" />
        <StatTile label="Live auctions" value={stats?.liveMatches ?? "—"} icon={Swords} accent="red" />
        <StatTile label="Open rooms" value={stats?.openRooms ?? "—"} icon={DoorOpen} accent="sky" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Quick match */}
        <div className="glass-strong relative overflow-hidden rounded-3xl p-6 neon-border lg:col-span-1 animate-slide-up">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-purple-600/35 blur-3xl" />
          <div className="relative flex h-full flex-col">
            <Zap className="h-8 w-8 text-purple-300" />
            <h2 className="mt-3 font-display text-2xl font-bold text-white">Quick match</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Get paired automatically with the next available bidder. Default rules: 8 lots, 20s timer, every supported anime.
            </p>
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
                      <div className="font-display font-semibold text-white" data-testid="queue-status">Searching for an opponent…</div>
                      <div className="font-display text-sm tabular-nums text-purple-200">{elapsed}</div>
                    </div>
                  </div>
                  <button className="btn btn-ghost w-full" onClick={cancel}>
                    <X className="h-4 w-4" /> Cancel search
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary w-full !py-3.5 !text-base" onClick={findMatch} disabled={pending || status !== "connected"} data-testid="find-match">
                  {pending ? <Spinner className="h-4 w-4 text-white" /> : <Swords className="h-5 w-5" />}
                  Find match
                </button>
              )}
              <FormError message={error} />
            </div>
          </div>
        </div>

        {/* Create */}
        <Link href="/play/create" className="glass group relative overflow-hidden rounded-3xl p-6 transition hover:border-purple-500/40 animate-slide-up" style={{ animationDelay: "80ms" }}>
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-rose-600/20 blur-3xl transition group-hover:bg-rose-600/30" />
          <Plus className="h-8 w-8 text-rose-300" />
          <h2 className="mt-3 font-display text-2xl font-bold text-white">Create room</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Pick the anime, number of lots and bid timer. Keep it private with a room code or list it publicly.
          </p>
          <span className="btn btn-ghost mt-6 w-full">Set up a room</span>
        </Link>

        {/* Join */}
        <div className="glass relative overflow-hidden rounded-3xl p-6 animate-slide-up" style={{ animationDelay: "160ms" }}>
          <KeyRound className="h-8 w-8 text-sky-300" />
          <h2 className="mt-3 font-display text-2xl font-bold text-white">Join with code</h2>
          <p className="mt-2 text-sm text-zinc-400">Got a code from a friend? Enter it to take the empty seat.</p>
          <div className="mt-6">
            <JoinCodeForm compact />
          </div>
        </div>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold text-white">
            <Globe className="h-5 w-5 text-purple-300" /> Open public rooms
          </h2>
          <span className="text-xs text-zinc-500">Updates live</span>
        </div>
        {rooms === null ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="glass rounded-2xl px-6 py-10 text-center text-sm text-zinc-400">
            No public rooms are waiting right now. Start a quick match or{" "}
            <Link href="/play/create" className="text-purple-300 hover:text-purple-200">
              create one
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
                    {r.settings.totalLots} lots · {r.settings.bidSeconds}s ·{" "}
                    {r.settings.animeIds.length === ENABLED_ANIME_IDS.length
                      ? "All anime"
                      : r.settings.animeIds.map((id) => getAnime(id)?.shortName ?? id).join(", ")}{" "}
                    · {timeAgo(r.createdAt)}
                  </div>
                </div>
                <Link href={`/room/${r.code}`} className="btn btn-primary !px-4 !py-2">
                  Join
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
