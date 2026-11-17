"use client";

import { useMemo } from "react";
import { Bot, Eye, Layers, PauseCircle, SkipForward, Sparkles, Timer, Zap } from "lucide-react";
import type { Ack, CharacterDTO, RoomSnapshot } from "@/game/types";
import { RARITY_INFO } from "@/game/rarity";
import { minimumNextBid } from "@/game/rules";
import { GAME_RULES } from "@/game/config";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { CharacterArt } from "@/components/character/CharacterArt";
import { AnimeBadge, RarityBadge } from "@/components/character/badges";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { BidControls } from "./BidControls";
import { BidFeed, LotHistoryStrip, PlayerPanel, SIDE_STYLES, TimerRing, type Side } from "./parts";
import type { RoomEventWithMeta } from "@/hooks/useRoom";

function useSides(snapshot: RoomSnapshot, myId: string | null, unknownLabel: string) {
  return useMemo(() => {
    const players = snapshot.players;
    const me = players.find((p) => p.userId === myId) ?? null;
    // You are always purple on the left; spectators see seat order.
    const left = me ?? players[0] ?? null;
    const right = players.find((p) => p.userId !== left?.userId) ?? null;
    const sideOf = (userId: string): Side => (userId === left?.userId ? "purple" : "red");
    const nameOf = (userId: string) => players.find((p) => p.userId === userId)?.username ?? unknownLabel;
    return { me, left, right, sideOf, nameOf };
  }, [snapshot.players, myId, unknownLabel]);
}

function CharacterShowcase({
  character,
  lotKey,
  dimmed,
  locale,
  t,
}: {
  character: CharacterDTO;
  lotKey: string;
  dimmed?: boolean;
  locale: "tr" | "en";
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const info = RARITY_INFO[character.rarity];
  return (
    <div key={lotKey} className="flex flex-col gap-5 md:flex-row md:items-stretch">
      <div className="relative mx-auto w-56 shrink-0 animate-card-enter sm:w-64 md:mx-0">
        <div className="absolute -inset-4 rounded-[2rem] animate-pulse-glow" style={{ background: info.glow }} />
        {character.rarity === "MYTHIC" || character.rarity === "LEGENDARY" ? (
          <div className="absolute -inset-[3px] overflow-hidden rounded-[1.4rem]">
            <div
              className="absolute -inset-[60%] animate-spin-slow"
              style={{ background: `conic-gradient(from 0deg, ${info.color}, transparent 30%, #a855f7, transparent 60%, ${info.color})` }}
            />
          </div>
        ) : null}
        <div
          className={cn("shine relative aspect-[3/4] overflow-hidden rounded-[1.3rem] border-2 bg-ink-900 transition", dimmed && "opacity-60")}
          style={{ borderColor: info.color }}
        >
          <CharacterArt name={character.name} animeId={character.animeId} imageUrl={character.imageUrl} eager />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute left-3 top-3">
            <RarityBadge rarity={character.rarity} size="md" locale={locale} />
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col animate-slide-up" style={{ animationDelay: "120ms" }}>
        <div className="flex flex-wrap items-center gap-2">
          <AnimeBadge animeId={character.animeId} />
          <span className="text-xs text-zinc-500">{t.auction.scoreIfWon(info.points)}</span>
        </div>
        <h2 className="mt-2 break-words font-display text-3xl font-bold leading-tight text-white md:text-4xl" data-testid="lot-character-name">
          {character.name}
        </h2>
        <p className="mt-1 text-sm font-medium" style={{ color: info.color }}>
          {character.title}
        </p>
        <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-zinc-300">{character.description}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {character.abilities.map((a) => (
            <span key={a} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200">
              {a}
            </span>
          ))}
        </div>
        {character.powerLevel !== null && (
          <div className="mt-auto pt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-amber-300" /> {t.characters.powerLevel}
              </span>
              <span className="font-display font-semibold text-white">{character.powerLevel}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full"
                style={{ width: `${character.powerLevel}%`, background: `linear-gradient(90deg, #7c3aed, ${info.color})` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AuctionStage({
  snapshot,
  myId,
  now,
  events,
  onBid,
  onSkip,
  onLeave,
}: {
  snapshot: RoomSnapshot;
  myId: string | null;
  now: number;
  events: RoomEventWithMeta[];
  onBid: (lotId: string, amount: number) => Promise<Ack<unknown>>;
  onSkip: () => Promise<Ack<unknown>>;
  onLeave: () => void;
}) {
  const { locale, t } = useLanguage();
  const { me, left, right, sideOf, nameOf } = useSides(snapshot, myId, t.auction.unknown);
  const lot = snapshot.currentLot;
  const phase = snapshot.phase;
  const charById = useMemo(() => {
    const map = new Map<string, CharacterDTO>();
    for (const h of snapshot.history) map.set(h.character.id, h.character);
    return map;
  }, [snapshot.history]);
  const won = (ids: string[]) => ids.map((id) => charById.get(id)).filter(Boolean) as CharacterDTO[];

  const bidding = phase === "BIDDING" && !!lot && lot.status === "ACTIVE";
  const remainingMs =
    phase === "BIDDING" && lot?.endsAt
      ? Math.max(0, lot.endsAt - now)
      : phase === "PAUSED"
        ? 0
        : snapshot.phaseEndsAt
          ? Math.max(0, snapshot.phaseEndsAt - now)
          : 0;
  const lastBidEvent = [...events].reverse().find((e) => e.type === "bid");
  const overtime = bidding && lastBidEvent?.type === "bid" && lastBidEvent.overtime && lot?.bids.at(-1)?.id === lastBidEvent.bid.id;
  const leaderSide = lot?.highestBidderId ? sideOf(lot.highestBidderId) : null;
  const disconnected = snapshot.players.filter((p) => !p.connected);
  const lotNumber = lot?.lotNumber ?? snapshot.lotsCompleted + 1;
  const teamSize = snapshot.settings.teamSize;
  const meFull = !!me && me.wonCharacterIds.length >= teamSize;
  // Skipping is possible until someone places a real bid (the automatic opening bid doesn't count).
  const realBids = lot ? lot.bids.length - (lot.forcedOpenerId ? 1 : 0) : 0;
  const canSkip = bidding && !!me && !meFull && realBids === 0 && remainingMs > 0;
  const skipVoted = !!lot && !!myId && lot.skipVotes.includes(myId);
  const opponentWantsSkip = !!lot && lot.skipVotes.some((id) => id !== myId);
  const turnNotice =
    bidding && lot
      ? lot.forcedOpenerId
        ? lot.forcedOpenerId === myId
          ? t.auction.forcedOpeningYou
          : t.auction.forcedOpening(nameOf(lot.forcedOpenerId))
        : t.auction.freeLot
      : phase === "INTERMISSION" && snapshot.nextOpenerId
        ? snapshot.nextOpenerId === myId
          ? t.auction.nextOpenerYou
          : t.auction.nextOpener(nameOf(snapshot.nextOpenerId))
        : null;

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
          <span className="font-display text-sm font-semibold uppercase tracking-widest text-white">{t.auction.liveAuction}</span>
          <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 font-display text-xs tracking-[0.25em] text-zinc-300">
            {snapshot.code}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5" data-testid="lot-counter">
            <Layers className="h-3.5 w-3.5 text-purple-300" /> {t.auction.roundLabel(lotNumber)}
          </span>
          <span className="flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5 text-purple-300" /> {t.auction.perLot(snapshot.settings.bidSeconds)}
          </span>
          <span className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-purple-300" /> {t.auction.watching(snapshot.spectators)}
          </span>
          {me && (
            <button className="btn btn-danger !px-3 !py-1.5 !text-[11px]" onClick={onLeave}>
              {t.auction.forfeit}
            </button>
          )}
        </div>
      </div>

      {/* Compact balances for small screens (full panels sit below the stage there) */}
      <div className="grid grid-cols-2 gap-3 lg:hidden">
        {[left, right].map((p, i) =>
          p ? (
            <div
              key={p.userId}
              className={cn(
                "glass flex items-center gap-2 rounded-xl p-2.5",
                lot?.status === "ACTIVE" && lot.highestBidderId === p.userId && (i === 0 ? "border-purple-500/50" : "border-rose-500/50"),
              )}
            >
              <Avatar username={p.username} style={p.avatar.style} imageUrl={p.avatar.imageUrl} size={30} ring={i === 0 ? "purple" : "red"} />
              <div className="min-w-0">
                <div className="truncate text-xs text-zinc-300">{p.userId === myId ? t.auction.you : p.username}</div>
                <div className={cn("font-display text-lg font-bold leading-none tabular-nums", i === 0 ? "text-purple-200" : "text-rose-200")}>
                  ${p.balance}{" "}
                  <span className="text-xs font-normal text-zinc-500">
                    · {p.score} {t.home.points} · {p.wonCharacterIds.length}/{teamSize}
                  </span>
                </div>
              </div>
            </div>
          ) : null,
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left player */}
        <div className="order-2 space-y-5 lg:order-1 lg:col-span-3">
          {left && (
            <PlayerPanel
              player={left}
              side="purple"
              isMe={left.userId === myId}
              leading={!!lot && lot.status === "ACTIVE" && lot.highestBidderId === left.userId}
              startingBalance={snapshot.settings.startingBalance}
              wonCharacters={won(left.wonCharacterIds)}
              teamSize={teamSize}
            />
          )}
          <div className="glass hidden rounded-2xl p-4 text-xs leading-relaxed text-zinc-400 lg:block">
            <div className="mb-2 flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-widest text-zinc-300">
              <Sparkles className="h-3.5 w-3.5 text-purple-300" /> {t.auction.rules}
            </div>
            <ul className="space-y-1.5">
              <li>{t.auction.ruleTeam(teamSize)}</li>
              <li>{t.auction.ruleTurns}</li>
              <li>{t.auction.ruleSkip}</li>
              <li>{t.auction.ruleBroke}</li>
              <li>{t.auction.ruleMinRaise(snapshot.settings.minIncrement)}</li>
              <li>{t.auction.ruleOvertime(snapshot.settings.overtimeSeconds)}</li>
              <li>{t.auction.tieBreakRule}</li>
              <li>{t.auction.ruleNoBids}</li>
            </ul>
          </div>
        </div>

        {/* Stage */}
        <div className="order-1 lg:order-2 lg:col-span-6">
          <div className="glass-strong relative overflow-hidden rounded-3xl p-5 md:p-6 neon-border">
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-purple-700/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-rose-700/20 blur-3xl" />

            <div className="relative mb-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-purple-300/80">
                  {phase === "COUNTDOWN" ? t.auction.openingSoon : t.auction.lotHash(lotNumber)}
                </div>
                <div className="text-xs text-zinc-500">{t.auction.poolRemaining(snapshot.poolRemaining)}</div>
              </div>
              <TimerRing
                remainingMs={phase === "PAUSED" ? 0 : remainingMs}
                totalMs={
                  phase === "BIDDING"
                    ? snapshot.settings.bidSeconds * 1000
                    : phase === "COUNTDOWN"
                      ? GAME_RULES.startCountdownMs
                      : phase === "INTERMISSION"
                        ? GAME_RULES.intermissionMs
                        : 1
                }
                paused={phase === "PAUSED"}
                label={phase === "INTERMISSION" ? t.auction.nextLotLabel : phase === "COUNTDOWN" ? t.auction.startingLabel : overtime ? t.auction.overtimeLabel : undefined}
              />
            </div>

            <div className="relative min-h-[320px]">
              {lot ? (
                <CharacterShowcase character={lot.character} lotKey={lot.id} dimmed={phase === "INTERMISSION" && (lot.status === "UNSOLD" || lot.skipped)} locale={locale} t={t} />
              ) : (
                <div className="flex h-[320px] flex-col items-center justify-center text-center">
                  <div className="font-display text-7xl font-bold text-gradient animate-pop-in" key={Math.ceil(remainingMs / 1000)}>
                    {Math.max(1, Math.ceil(remainingMs / 1000))}
                  </div>
                  <p className="mt-3 font-display text-sm uppercase tracking-[0.3em] text-zinc-400">{t.auction.firstCharPrompt}</p>
                </div>
              )}

              {/* Result overlay */}
              {phase === "INTERMISSION" && lot && lot.status !== "ACTIVE" && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/55 backdrop-blur-[2px]">
                  {lot.status === "SOLD" && lot.winnerId && lot.autoAssigned ? (
                    <div className="px-4 text-center" data-testid="lot-result">
                      <div className="inline-flex items-center gap-3 rounded-2xl border-4 border-sky-400 px-6 py-3 font-display text-3xl font-black uppercase tracking-widest text-sky-200 animate-stamp sm:text-4xl">
                        <Bot className="h-8 w-8" /> {t.auction.autoStamp}
                      </div>
                      <p className="mt-4 text-sm text-zinc-200">
                        {lot.winnerId === myId
                          ? t.auction.autoAssignedYou(lot.character.name)
                          : t.auction.autoAssignedOther(nameOf(lot.winnerId), lot.character.name)}
                      </p>
                    </div>
                  ) : lot.skipped ? (
                    <div className="px-4 text-center" data-testid="lot-result">
                      <div className="inline-flex items-center gap-3 rounded-2xl border-4 border-zinc-500 px-6 py-3 font-display text-3xl font-black uppercase tracking-widest text-zinc-300 animate-stamp sm:text-4xl">
                        <SkipForward className="h-8 w-8" /> {t.auction.skippedStamp}
                      </div>
                      <p className="mt-4 text-sm text-zinc-300">{t.auction.skippedText(lot.character.name)}</p>
                    </div>
                  ) : lot.status === "SOLD" && lot.winnerId ? (
                    <div className="px-4 text-center" data-testid="lot-result">
                      <div
                        className={cn(
                          "inline-block rounded-2xl border-4 px-8 py-3 font-display text-4xl font-black uppercase tracking-widest animate-stamp sm:text-5xl",
                          sideOf(lot.winnerId) === "purple" ? "border-purple-400 text-neon-purple" : "border-rose-400 text-neon-red",
                        )}
                      >
                        {t.auction.soldStamp}
                      </div>
                      <div className="mt-5 flex items-center justify-center gap-3 animate-slide-up" style={{ animationDelay: "250ms" }}>
                        <Avatar
                          username={nameOf(lot.winnerId)}
                          style={snapshot.players.find((p) => p.userId === lot.winnerId)?.avatar.style ?? "violet"}
                          imageUrl={snapshot.players.find((p) => p.userId === lot.winnerId)?.avatar.imageUrl}
                          size={40}
                          ring={sideOf(lot.winnerId) === "purple" ? "purple" : "red"}
                        />
                        <div className="text-left">
                          <div className="font-display text-lg font-bold text-white">
                            {lot.winnerId === myId ? t.auction.youWonWord : t.auction.theyWonWord(nameOf(lot.winnerId))} {lot.character.name}
                          </div>
                          <div className="text-sm text-zinc-300">{t.auction.forPrice(lot.finalPrice ?? 0)}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 text-center" data-testid="lot-result">
                      <div className="inline-block rounded-2xl border-4 border-zinc-500 px-8 py-3 font-display text-3xl font-black uppercase tracking-widest text-zinc-300 animate-stamp sm:text-4xl">
                        {t.auction.unsoldStamp}
                      </div>
                      <p className="mt-4 text-sm text-zinc-300">{t.auction.nobodyBid(lot.character.name)}</p>
                    </div>
                  )}
                </div>
              )}

              {phase === "PAUSED" && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
                  <div className="max-w-sm px-4 text-center animate-pop-in">
                    <PauseCircle className="mx-auto h-12 w-12 text-amber-300" />
                    <h3 className="mt-3 font-display text-2xl font-bold text-white">{t.auction.matchPaused}</h3>
                    <p className="mt-2 text-sm text-zinc-300">
                      {t.auction.waitingReconnect(disconnected.map((p) => p.username).join(" & ") || t.auction.aPlayer)}
                    </p>
                    {snapshot.phaseEndsAt && (
                      <p className="mt-3 font-display text-lg text-amber-200 tabular-nums">
                        {t.auction.forfeitIn(Math.max(0, Math.ceil((snapshot.phaseEndsAt - now) / 1000)))}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bid display */}
            {lot && (
              <div className="relative mt-6 grid grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-400">{t.auction.currentBid}</div>
                  <div
                    key={lot.highestBid ?? "none"}
                    className={cn(
                      "font-display text-3xl font-black tabular-nums sm:text-4xl md:text-5xl animate-bid-flash",
                      leaderSide === "purple" ? "text-neon-purple" : leaderSide === "red" ? "text-neon-red" : "text-zinc-500",
                    )}
                    data-testid="current-bid"
                  >
                    {lot.highestBid !== null ? `$${lot.highestBid}` : "—"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-400">{t.auction.highestBidder}</div>
                  {lot.highestBidderId ? (
                    <div className={cn("mt-2 truncate font-display text-base font-semibold sm:text-lg", SIDE_STYLES[leaderSide!].text)} data-testid="highest-bidder">
                      {lot.highestBidderId === myId ? t.auction.you : nameOf(lot.highestBidderId)}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-zinc-500">{t.auction.noBidsYet}</div>
                  )}
                </div>
                <div className="min-w-0 text-right">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-400">{t.auction.startMinNext}</div>
                  <div className="mt-2 font-display text-base font-semibold text-white tabular-nums sm:text-lg">
                    ${lot.startingPrice} · <span className="text-purple-200">${minimumNextBid(lot, snapshot.settings.minIncrement)}</span>
                  </div>
                </div>
              </div>
            )}

            {turnNotice && (
              <p className="relative mt-3 rounded-xl border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-xs text-purple-100" data-testid="turn-notice">
                {turnNotice}
              </p>
            )}

            {lot && lot.status === "ACTIVE" && (
              <div className="relative mt-4">
                <BidControls
                  lot={lot}
                  me={me}
                  minIncrement={snapshot.settings.minIncrement}
                  biddingOpen={bidding && remainingMs > 0}
                  isSpectator={!me}
                  teamFull={meFull}
                  onBid={onBid}
                  skip={{ available: canSkip, voted: skipVoted, opponentWants: opponentWantsSkip, onSkip }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right player + feed */}
        <div className="order-3 space-y-5 lg:col-span-3">
          {right ? (
            <PlayerPanel
              player={right}
              side="red"
              isMe={right.userId === myId}
              leading={!!lot && lot.status === "ACTIVE" && lot.highestBidderId === right.userId}
              startingBalance={snapshot.settings.startingBalance}
              wonCharacters={won(right.wonCharacterIds)}
              teamSize={teamSize}
            />
          ) : null}
          <BidFeed bids={lot?.bids ?? []} sideOf={sideOf} now={now} />
        </div>
      </div>

      <LotHistoryStrip history={snapshot.history} sideOf={sideOf} nameOf={nameOf} />
    </div>
  );
}
