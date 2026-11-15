"use client";

import { useState } from "react";
import { Check, Copy, Crown, Globe, Link2, Lock, LogOut, Timer, Layers, UserPlus, Wifi, WifiOff, Wallet } from "lucide-react";
import type { Ack, RoomSnapshot } from "@/game/types";
import { getAnime } from "@/data/anime";
import { RARITIES, RARITY_INFO } from "@/game/rarity";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { RARITY_LABELS } from "@/lib/i18n";
import { Avatar } from "@/components/ui/Avatar";
import { FormError, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

function CopyButton({
  text,
  label,
  copiedLabel,
  copyPrompt,
  icon: Icon,
}: {
  text: string;
  label: string;
  copiedLabel: string;
  copyPrompt: string;
  icon: typeof Copy;
}) {
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
          window.prompt(copyPrompt, text);
        }
      }}
    >
      {done ? <Check className="h-4 w-4 text-emerald-300" /> : <Icon className="h-4 w-4" />}
      {done ? copiedLabel : label}
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
  const { locale, t } = useLanguage();
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
                {snapshot.isPrivate
                  ? t.auction.lobby.privateRoom
                  : snapshot.isMatchmade
                    ? t.auction.lobby.matchmadeRoom
                    : t.auction.lobby.publicRoom}
              </div>
              <div className="mt-2 font-display text-5xl font-black tracking-[0.25em] text-white md:text-6xl" data-testid="room-code">
                {snapshot.code}
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                {full ? t.auction.lobby.bothFilled : t.auction.lobby.shareCode}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton
                text={snapshot.code}
                label={t.auction.lobby.copyCode}
                copiedLabel={t.auction.lobby.copied}
                copyPrompt={t.auction.lobby.copyPrompt}
                icon={Copy}
              />
              <CopyButton
                text={shareUrl}
                label={t.auction.lobby.copyLink}
                copiedLabel={t.auction.lobby.copied}
                copyPrompt={t.auction.lobby.copyPrompt}
                icon={Link2}
              />
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
                        {p.isHost && <Crown className="h-4 w-4 shrink-0 text-amber-300" aria-label={t.auction.lobby.hostAria} />}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        {p.connected ? (
                          <span className="flex items-center gap-1 text-emerald-300">
                            <Wifi className="h-3 w-3" /> {t.auction.lobby.connected}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-300">
                            <WifiOff className="h-3 w-3" /> {t.auction.lobby.disconnected}
                            {p.disconnectDeadline
                              ? t.auction.lobby.seatHeld(Math.max(0, Math.ceil((p.disconnectDeadline - now) / 1000)))
                              : ""}
                          </span>
                        )}
                        {p.userId === myId && <span className="text-zinc-500">{t.auction.lobby.youSuffix}</span>}
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
                      {p.ready ? t.auction.lobby.ready : t.auction.lobby.notReady}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-white/20">
                    <span className="absolute inset-0 animate-ping rounded-full border border-purple-500/30" />
                    <UserPlus className="h-6 w-6 text-zinc-500" />
                  </div>
                  <div className="font-display font-semibold text-zinc-300">{t.auction.lobby.waitingChallenger}</div>
                  <div className="mt-1 text-xs text-zinc-500">{t.auction.lobby.canJoinWithCode(snapshot.code)}</div>
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
                  ? t.auction.lobby.readyHintNotFull
                  : me.ready
                    ? t.auction.lobby.readyHintWaitingOpp
                    : t.auction.lobby.readyHintBothHere}
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost" onClick={onLeave}>
                  <LogOut className="h-4 w-4" /> {t.auction.lobby.leave}
                </button>
                <button className={cn("btn min-w-36", me.ready ? "btn-ghost" : "btn-primary")} onClick={toggleReady} disabled={pending} data-testid="ready-button">
                  {pending && <Spinner className="h-4 w-4 text-white" />}
                  {me.ready ? t.auction.lobby.cancelReady : t.auction.lobby.imReady}
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-zinc-400">{t.auction.lobby.roomFullSpectator}</div>
          )}
        </div>
        <FormError message={error} />
      </div>

      <div className="space-y-6 lg:col-span-2">
        <div className="glass rounded-3xl p-6 animate-slide-up" style={{ animationDelay: "120ms" }}>
          <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.auction.lobby.matchSettings}</h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-zinc-400"><Wallet className="h-3.5 w-3.5" /> {t.play.startingBalance}</dt>
              <dd className="mt-1 font-display text-xl font-bold text-white">${snapshot.settings.startingBalance}</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-zinc-400"><Layers className="h-3.5 w-3.5" /> {t.play.lotsLabel}</dt>
              <dd className="mt-1 font-display text-xl font-bold text-white">{snapshot.settings.totalLots}</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-zinc-400"><Timer className="h-3.5 w-3.5" /> {t.play.bidTimer}</dt>
              <dd className="mt-1 font-display text-xl font-bold text-white">{snapshot.settings.bidSeconds}{t.auction.secLabel}</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="text-xs text-zinc-400">{t.auction.lobby.minIncrement}</dt>
              <dd className="mt-1 font-display text-xl font-bold text-white">${snapshot.settings.minIncrement}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <div className="mb-2 text-xs text-zinc-400">{t.auction.lobby.animeInPool}</div>
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
          <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.auction.lobby.howItPlays}</h3>
          <ol className="mt-4 space-y-2.5 text-sm text-zinc-300">
            <li><b className="text-white">1.</b> {t.auction.lobby.playStep1}</li>
            <li><b className="text-white">2.</b> {t.auction.lobby.playStep2(snapshot.settings.overtimeSeconds)}</li>
            <li><b className="text-white">3.</b> {t.auction.lobby.playStep3}</li>
            <li><b className="text-white">4.</b> {t.auction.lobby.playStep4(snapshot.settings.totalLots)}</li>
          </ol>
          <div className="mt-4 grid grid-cols-2 gap-1.5 text-center text-[10px] sm:grid-cols-5">
            {RARITIES.map((r) => (
              <div key={r} className="rounded-lg border p-1.5" style={{ borderColor: `${RARITY_INFO[r].color}55`, color: RARITY_INFO[r].color }}>
                <div className="font-semibold uppercase">{RARITY_LABELS[locale][r]}</div>
                <div className="text-zinc-400">{t.auction.lobby.ptFrom(RARITY_INFO[r].points, RARITY_INFO[r].startingPrice)}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-zinc-300">
            <b className="text-purple-200">{t.auction.lobby.tieRuleLabel}</b> {t.auction.tieBreakRule}
          </p>
        </div>
      </div>
    </div>
  );
}
