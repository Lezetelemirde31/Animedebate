"use client";

import { useState } from "react";
import { Check, Copy, Crown, Globe, Link2, Lock, LogOut, Timer, Layers, UserPlus, Wifi, WifiOff, Wallet } from "lucide-react";
import type { Ack, RoomSnapshot } from "@/game/types";
import { getAnime } from "@/data/anime";
import { TIE_BREAK_RULE } from "@/game/config";
import { RARITIES, RARITY_INFO } from "@/game/rarity";
import { Avatar } from "@/components/ui/Avatar";
import { FormError, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

function CopyButton({ text, label, icon: Icon }: { text: string; label: string; icon: typeof Copy }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-ghost !py-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy this:", text);
        }
      }}
    >
      {done ? <Check className="h-4 w-4 text-emerald-300" /> : <Icon className="h-4 w-4" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function LobbyView({
  snapshot,
  myId,
  now,
  onReady,
  onLeave,
}: {
  snapshot: RoomSnapshot;
  myId: string | null;
  now: number;
  onReady: (ready: boolean) => Promise<Ack>;
  onLeave: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = snapshot.players.find((p) => p.userId === myId) ?? null;
  const seats = [0, 1].map((seat) => snapshot.players.find((p) => p.seat === seat) ?? null);
  const full = snapshot.players.length === 2;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${snapshot.code}` : `/room/${snapshot.code}`;

  async function toggleReady() {
    if (!me) return;
    setPending(true);
    setError(null);
    const res = await onReady(!me.ready);
    setPending(false);
    if (!res.ok) setError(res.message);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-6 md:p-8 neon-border animate-slide-up">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-purple-600/30 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-purple-300/80">
                {snapshot.isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                {snapshot.isPrivate ? "Private room" : snapshot.isMatchmade ? "Matchmade room" : "Public room"}
              </div>
              <div className="mt-2 font-display text-5xl font-black tracking-[0.25em] text-white md:text-6xl" data-testid="room-code">
                {snapshot.code}
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                {full ? "Both seats are filled. Ready up to start the auction." : "Share this code with your opponent to let them join."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={snapshot.code} label="Copy code" icon={Copy} />
              <CopyButton text={shareUrl} label="Copy link" icon={Link2} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {seats.map((p, i) => (
            <div
              key={i}
              className={cn(
                "glass relative min-h-[180px] overflow-hidden rounded-3xl p-6 transition animate-slide-up",
                p?.ready && (i === 0 ? "border-purple-500/50 neon-border" : "border-rose-500/50 neon-border-red"),
              )}
              style={{ animationDelay: `${i * 80}ms` }}
              data-testid={`seat-${i}`}
            >
              {p ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center gap-4">
                    <Avatar username={p.username} style={p.avatar.style} imageUrl={p.avatar.imageUrl} size={64} ring={i === 0 ? "purple" : "red"} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-display text-xl font-bold text-white">{p.username}</span>
                        {p.isHost && <Crown className="h-4 w-4 text-amber-300" aria-label="Host" />}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs">
                        {p.connected ? (
                          <span className="flex items-center gap-1 text-emerald-300">
                            <Wifi className="h-3 w-3" /> Connected
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-300">
                            <WifiOff className="h-3 w-3" /> Disconnected
                            {p.disconnectDeadline ? ` · seat held ${Math.max(0, Math.ceil((p.disconnectDeadline - now) / 1000))}s` : ""}
                          </span>
                        )}
                        {p.userId === myId && <span className="text-zinc-500">· you</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto pt-5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-3 py-1 font-display text-xs font-semibold uppercase tracking-widest",
                        p.ready ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-zinc-400",
                      )}
                      data-testid={`ready-state-${p.username}`}
                    >
                      <span className={cn("h-2 w-2 rounded-full", p.ready ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-zinc-500")} />
                      {p.ready ? "Ready" : "Not ready"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-white/20">
                    <span className="absolute inset-0 animate-ping rounded-full border border-purple-500/30" />
                    <UserPlus className="h-6 w-6 text-zinc-500" />
                  </div>
                  <div className="font-display font-semibold text-zinc-300">Waiting for a challenger…</div>
                  <div className="mt-1 text-xs text-zinc-500">They can join with code {snapshot.code}</div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="glass flex flex-col gap-3 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
          {me ? (
            <>
              <div className="text-sm text-zinc-400">
                {!full
                  ? "You can ready up now — the auction starts when both players are ready."
                  : me.ready
                    ? "Waiting for your opponent to ready up…"
                    : "Your opponent is here. Ready up when you are!"}
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost" onClick={onLeave}>
                  <LogOut className="h-4 w-4" /> Leave
                </button>
                <button className={cn("btn min-w-36", me.ready ? "btn-ghost" : "btn-primary")} onClick={toggleReady} disabled={pending} data-testid="ready-button">
                  {pending && <Spinner className="h-4 w-4 text-white" />}
                  {me.ready ? "Cancel ready" : "I'm ready"}
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-zinc-400">This room is full — you are watching as a spectator.</div>
          )}
        </div>
        <FormError message={error} />
      </div>

      <div className="space-y-6 lg:col-span-2">
        <div className="glass rounded-3xl p-6 animate-slide-up" style={{ animationDelay: "120ms" }}>
          <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">Match settings</h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-zinc-400"><Wallet className="h-3.5 w-3.5" /> Starting balance</dt>
              <dd className="mt-1 font-display text-xl font-bold text-white">${snapshot.settings.startingBalance}</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-zinc-400"><Layers className="h-3.5 w-3.5" /> Lots</dt>
              <dd className="mt-1 font-display text-xl font-bold text-white">{snapshot.settings.totalLots}</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-zinc-400"><Timer className="h-3.5 w-3.5" /> Bid timer</dt>
              <dd className="mt-1 font-display text-xl font-bold text-white">{snapshot.settings.bidSeconds}s</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="text-xs text-zinc-400">Min increment</dt>
              <dd className="mt-1 font-display text-xl font-bold text-white">${snapshot.settings.minIncrement}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <div className="mb-2 text-xs text-zinc-400">Anime in the pool</div>
            <div className="flex flex-wrap gap-1.5">
              {snapshot.settings.animeIds.map((id) => {
                const a = getAnime(id);
                return (
                  <span key={id} className="rounded-full border px-2.5 py-1 text-xs" style={{ color: a?.color, borderColor: `${a?.color}55`, background: `${a?.color}14` }}>
                    {a?.shortName ?? id}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="glass rounded-3xl p-6 animate-slide-up" style={{ animationDelay: "200ms" }}>
          <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">How it plays</h3>
          <ol className="mt-4 space-y-2.5 text-sm text-zinc-300">
            <li><b className="text-white">1.</b> A random character is revealed to both players at the same moment.</li>
            <li><b className="text-white">2.</b> Outbid each other before the timer hits zero. Late bids trigger {snapshot.settings.overtimeSeconds}s of overtime.</li>
            <li><b className="text-white">3.</b> The winner pays their bid and the character joins their collection forever.</li>
            <li><b className="text-white">4.</b> After {snapshot.settings.totalLots} lots, the highest collection score wins the match.</li>
          </ol>
          <div className="mt-4 grid grid-cols-5 gap-1.5 text-center text-[10px]">
            {RARITIES.map((r) => (
              <div key={r} className="rounded-lg border p-1.5" style={{ borderColor: `${RARITY_INFO[r].color}55`, color: RARITY_INFO[r].color }}>
                <div className="font-semibold uppercase">{RARITY_INFO[r].label}</div>
                <div className="text-zinc-400">{RARITY_INFO[r].points} pt · from ${RARITY_INFO[r].startingPrice}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-zinc-300">
            <b className="text-purple-200">Tie rule:</b> {TIE_BREAK_RULE}
          </p>
        </div>
      </div>
    </div>
  );
}
