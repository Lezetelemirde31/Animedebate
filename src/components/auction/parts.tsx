"use client";

import { Crown, Wifi, WifiOff } from "lucide-react";
import type { BidDTO, CharacterDTO, LotSummary, PlayerState } from "@/game/types";
import { RARITY_INFO } from "@/game/rarity";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { Avatar } from "@/components/ui/Avatar";
import { CharacterArt } from "@/components/character/CharacterArt";
import { cn } from "@/lib/utils";

export type Side = "purple" | "red";

export const SIDE_STYLES: Record<Side, { text: string; ring: "purple" | "red"; bg: string; border: string; glow: string; hex: string }> = {
  purple: {
    text: "text-purple-200",
    ring: "purple",
    bg: "bg-purple-500/10",
    border: "border-purple-500/40",
    glow: "shadow-[0_0_40px_-8px_rgba(168,85,247,0.8)]",
    hex: "#a855f7",
  },
  red: {
    text: "text-rose-200",
    ring: "red",
    bg: "bg-rose-500/10",
    border: "border-rose-500/40",
    glow: "shadow-[0_0_40px_-8px_rgba(244,63,94,0.8)]",
    hex: "#f43f5e",
  },
};

/** Circular countdown. */
export function TimerRing({
  remainingMs,
  totalMs,
  paused,
  size = 112,
  label,
}: {
  remainingMs: number;
  totalMs: number;
  paused?: boolean;
  size?: number;
  label?: string;
}) {
  const { t } = useLanguage();
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remainingMs / Math.max(1, totalMs)));
  const secs = Math.ceil(remainingMs / 1000);
  const danger = !paused && remainingMs <= 5000;
  const stroke = paused ? "#f59e0b" : danger ? "#f43f5e" : "#a855f7";
  return (
    <div className={cn("relative shrink-0", danger && "animate-pulse")} style={{ width: size, height: size }} role="timer" aria-live="off">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="7" fill="rgba(5,3,8,0.6)" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={stroke}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ filter: `drop-shadow(0 0 8px ${stroke})`, transition: "stroke-dashoffset 0.1s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
        <span className={cn("font-display font-bold tabular-nums", danger ? "text-rose-300" : "text-white")} style={{ fontSize: size * 0.3 }}>
          {paused ? "II" : secs}
        </span>
        <span className="text-[9px] uppercase tracking-widest text-zinc-400">
          {label ?? (paused ? t.auction.pausedLabel : t.auction.secLabel)}
        </span>
      </div>
    </div>
  );
}

export function PlayerPanel({
  player,
  side,
  isMe,
  leading,
  startingBalance,
  wonCharacters,
  teamSize,
  compact,
}: {
  player: PlayerState;
  side: Side;
  isMe: boolean;
  leading: boolean;
  startingBalance: number;
  wonCharacters: CharacterDTO[];
  /** Characters per team: shows progress and empty slots. */
  teamSize?: number;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const s = SIDE_STYLES[side];
  const pct = Math.round((player.balance / Math.max(1, startingBalance)) * 100);
  return (
    <div
      className={cn(
        "glass relative overflow-hidden rounded-2xl p-4 transition duration-300",
        leading && cn(s.border, s.glow, "border"),
      )}
      data-testid={`player-panel-${player.username}`}
    >
      <div className={cn("pointer-events-none absolute -top-12 h-32 w-32 rounded-full blur-3xl", side === "purple" ? "-left-10 bg-purple-600/25" : "-right-10 bg-rose-600/25")} />
      <div className="relative flex items-center gap-3">
        <Avatar username={player.username} style={player.avatar.style} imageUrl={player.avatar.imageUrl} size={compact ? 40 : 52} ring={s.ring} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-display font-semibold text-white">{player.username}</span>
            {player.isHost && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-label={t.auction.lobby.hostAria} />}
            {isMe && <span className="rounded bg-white/10 px-1.5 text-[10px] font-semibold uppercase text-zinc-300">{t.auction.you}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            {player.connected ? (
              <span className="flex items-center gap-1 text-emerald-300">
                <Wifi className="h-3 w-3" /> {t.auction.online}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-300">
                <WifiOff className="h-3 w-3" /> {t.auction.reconnecting}
              </span>
            )}
            {leading && <span className={cn("font-semibold", s.text)}>· {t.auction.leading}</span>}
          </div>
        </div>
      </div>
      <div className="relative mt-4 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">{t.auction.balance}</div>
          <div className={cn("font-display text-3xl font-bold tabular-nums", s.text)} data-testid={`balance-${player.username}`}>
            ${player.balance}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">{t.auction.score}</div>
          <div className="font-display text-xl font-bold text-white tabular-nums">{player.score}</div>
        </div>
      </div>
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${s.hex}, ${side === "purple" ? "#e879f9" : "#fb7185"})` }}
        />
      </div>
      {!compact && (
        <div className="relative mt-4">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-zinc-400">
            <span data-testid={`team-${player.username}`}>
              {teamSize ? t.auction.teamProgress(wonCharacters.length, teamSize) : t.auction.wonThisMatch(wonCharacters.length)}
            </span>
            {!!teamSize && wonCharacters.length >= teamSize && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold normal-case tracking-normal text-emerald-300">{t.auction.teamFullBadge}</span>
            )}
          </div>
          {!!teamSize && (
            <div className="mb-2 flex gap-1" aria-hidden>
              {Array.from({ length: teamSize }, (_, i) => (
                <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < wonCharacters.length ? s.hex : "rgba(255,255,255,0.1)" }} />
              ))}
            </div>
          )}
          {wonCharacters.length === 0 ? (
            <p className="text-xs text-zinc-500">{t.auction.noCharsYet}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {wonCharacters.map((c) => (
                <div
                  key={c.id}
                  title={c.name}
                  className="h-11 w-9 overflow-hidden rounded-md border animate-pop-in"
                  style={{ borderColor: RARITY_INFO[c.rarity].color }}
                >
                  <CharacterArt name={c.name} animeId={c.animeId} imageUrl={c.imageUrl} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BidFeed({ bids, sideOf, now }: { bids: BidDTO[]; sideOf: (userId: string) => Side; now: number }) {
  const { t } = useLanguage();
  const list = [...bids].reverse();
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.auction.bidHistory}</h3>
        <span className="text-xs text-zinc-500">{t.auction.bidsCount(bids.length)}</span>
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">{t.auction.noBidsOnLot}</p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1" data-testid="bid-feed">
          {list.map((b, i) => {
            const s = SIDE_STYLES[sideOf(b.userId)];
            return (
              <li
                key={b.id}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2 text-sm animate-slide-up",
                  i === 0 ? cn(s.border, s.bg) : "border-white/5 bg-white/[0.02]",
                )}
              >
                <span className={cn("truncate font-medium", s.text)}>{b.username}</span>
                <span className="flex items-center gap-3">
                  <span className="text-[11px] text-zinc-500">{t.auction.secAgo(Math.max(0, Math.round((now - b.at) / 1000)))}</span>
                  <span className="font-display font-bold tabular-nums text-white">${b.amount}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function LotHistoryStrip({
  history,
  sideOf,
  nameOf,
}: {
  history: LotSummary[];
  sideOf: (userId: string) => Side;
  nameOf: (userId: string) => string;
}) {
  const { t } = useLanguage();
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.auction.auctionHistory}</h3>
        <span className="text-xs text-zinc-500">{t.auction.roundsCount(history.length)}</span>
      </div>
      {history.length === 0 ? (
        <p className="py-3 text-sm text-zinc-500">{t.auction.completedLotsHere}</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {history.map((h) => {
            const sold = h.status === "SOLD" && h.winnerId;
            const s = sold ? SIDE_STYLES[sideOf(h.winnerId!)] : null;
            return (
              <div key={h.id} className="w-28 shrink-0 animate-pop-in" title={h.character.name}>
                <div
                  className={cn("relative aspect-[3/4] overflow-hidden rounded-xl border", sold ? s!.border : "border-white/10 opacity-60 grayscale")}
                >
                  <CharacterArt name={h.character.name} animeId={h.character.animeId} imageUrl={h.character.imageUrl} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5">
                    <div className="truncate text-[11px] font-semibold text-white">{h.character.name}</div>
                  </div>
                  <div className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-semibold text-zinc-200">#{h.lotNumber}</div>
                </div>
                <div className={cn("mt-1 truncate text-center text-xs font-semibold", sold ? s!.text : "text-zinc-500")}>
                  {sold
                    ? h.autoAssigned
                      ? `${nameOf(h.winnerId!)} · ${t.auction.autoStamp}`
                      : `${nameOf(h.winnerId!)} · $${h.finalPrice}`
                    : h.skipped
                      ? t.auction.skippedStamp
                      : t.auction.unsoldStamp}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
