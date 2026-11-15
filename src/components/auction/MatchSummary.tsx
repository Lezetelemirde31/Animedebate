"use client";

import Link from "next/link";
import { useState } from "react";
import { History, Library, RefreshCw, Swords, Trophy } from "lucide-react";
import type { Ack, CharacterDTO, RoomSnapshot } from "@/game/types";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { CharacterCard } from "@/components/character/CharacterCard";
import { Avatar } from "@/components/ui/Avatar";
import { FormError, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { LotHistoryStrip, SIDE_STYLES, type Side } from "./parts";

export function MatchSummary({
  snapshot,
  myId,
  onRematch,
}: {
  snapshot: RoomSnapshot;
  myId: string | null;
  onRematch: () => Promise<Ack>;
}) {
  const { locale, t } = useLanguage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = snapshot.result;
  const players = snapshot.players;
  const me = players.find((p) => p.userId === myId) ?? null;
  const ordered = me ? [me, ...players.filter((p) => p.userId !== me.userId)] : players;
  const sideOf = (id: string): Side => (id === ordered[0]?.userId ? "purple" : "red");
  const nameOf = (id: string) => players.find((p) => p.userId === id)?.username ?? t.auction.unknown;
  const chars = new Map<string, CharacterDTO>(snapshot.history.map((h) => [h.character.id, h.character]));
  const abandoned = snapshot.phase === "ABANDONED";

  let headline: string = t.auction.summary.matchOver;
  let tone: "win" | "loss" | "draw" | "neutral" = "neutral";
  if (abandoned) {
    headline = t.auction.summary.matchAbandoned;
  } else if (result) {
    if (!result.winnerId) {
      headline = t.auction.summary.draw;
      tone = "draw";
    } else if (me) {
      tone = result.winnerId === me.userId ? "win" : "loss";
      headline = tone === "win" ? t.auction.summary.victory : t.auction.summary.defeat;
    } else {
      headline = t.auction.summary.winsSuffix(nameOf(result.winnerId));
    }
  }

  const votedByMe = !!me && snapshot.rematchVotes.includes(me.userId);
  const opponentVoted = snapshot.rematchVotes.some((id) => id !== myId);
  const everyoneHere = players.length === 2 && players.every((p) => p.connected);

  async function rematch() {
    setPending(true);
    setError(null);
    const res = await onRematch();
    setPending(false);
    if (!res.ok) setError(res.message);
  }

  return (
    <div className="space-y-6">
      <div className="glass-strong relative overflow-hidden rounded-3xl p-8 text-center neon-border animate-pop-in" data-testid="match-summary">
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 rounded-full blur-3xl",
            tone === "win" ? "bg-purple-600/40" : tone === "loss" ? "bg-rose-700/35" : "bg-zinc-500/20",
          )}
        />
        <div className="relative">
          <Trophy className={cn("mx-auto h-12 w-12", tone === "win" ? "text-amber-300" : tone === "loss" ? "text-rose-300" : "text-zinc-300")} />
          <h1
            className={cn(
              "mt-3 break-words font-display text-4xl font-black uppercase tracking-widest sm:text-5xl md:text-6xl",
              tone === "win" ? "text-gradient" : tone === "loss" ? "text-neon-red" : "text-white",
            )}
            data-testid="match-headline"
          >
            {headline}
          </h1>
          {result?.detail && <p className="mt-3 text-zinc-300">{result.detail}</p>}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {ordered.map((p) => {
          const s = SIDE_STYLES[sideOf(p.userId)];
          const won = p.wonCharacterIds.map((id) => chars.get(id)).filter(Boolean) as CharacterDTO[];
          const isWinner = result?.winnerId === p.userId;
          return (
            <div key={p.userId} className={cn("glass rounded-3xl p-5", isWinner && cn("border", s.border, s.glow))}>
              <div className="flex items-center gap-3">
                <Avatar username={p.username} style={p.avatar.style} imageUrl={p.avatar.imageUrl} size={52} ring={s.ring} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-display text-lg font-bold text-white">
                    <span className="truncate">{p.username}</span> {isWinner && <Trophy className="h-4 w-4 shrink-0 text-amber-300" />}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {t.auction.summary.charsSpent(won.length, snapshot.settings.startingBalance - p.balance)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-400">{t.auction.score}</div>
                  <div className={cn("font-display text-3xl font-bold", s.text)}>{p.score}</div>
                  <div className="text-xs text-zinc-400">{t.auction.summary.balanceLeft(p.balance)}</div>
                </div>
              </div>
              {won.length > 0 ? (
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {won.map((c) => (
                    <CharacterCard key={c.id} character={c} compact href={`/characters/${c.id}`} locale={locale} />
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-500">{t.auction.summary.noCharsWonMatch}</p>
              )}
            </div>
          );
        })}
      </div>

      <LotHistoryStrip history={snapshot.history} totalLots={snapshot.settings.totalLots} sideOf={sideOf} nameOf={nameOf} />

      <div className="glass flex flex-col items-center justify-between gap-4 rounded-3xl p-5 md:flex-row">
        <p className="text-sm text-zinc-400">
          {abandoned
            ? t.auction.summary.abandonedNote
            : me
              ? votedByMe
                ? t.auction.summary.rematchRequested
                : opponentVoted
                  ? t.auction.summary.opponentWantsRematch
                  : t.auction.summary.wonCharsSaved
              : t.auction.summary.watchedAsSpectator}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {me && !abandoned && (
            <button className="btn btn-primary" onClick={rematch} disabled={pending || votedByMe || !everyoneHere} data-testid="rematch-button">
              {pending ? <Spinner className="h-4 w-4 text-white" /> : <RefreshCw className="h-4 w-4" />}
              {votedByMe ? t.auction.summary.waitingDots : opponentVoted ? t.auction.summary.acceptRematch : t.auction.summary.rematch}
            </button>
          )}
          <Link href="/play" className="btn btn-ghost">
            <Swords className="h-4 w-4" /> {t.auction.summary.newMatch}
          </Link>
          <Link href={`/history/${snapshot.matchId}`} className="btn btn-ghost">
            <History className="h-4 w-4" /> {t.auction.summary.fullReport}
          </Link>
          {me && (
            <Link href="/collection" className="btn btn-ghost">
              <Library className="h-4 w-4" /> {t.auction.summary.collection}
            </Link>
          )}
        </div>
      </div>
      {me && !everyoneHere && !abandoned && <p className="text-center text-xs text-zinc-500">{t.auction.summary.rematchNeedsBoth}</p>}
      <FormError message={error} />
    </div>
  );
}
