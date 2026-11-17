"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Crown,
  EyeOff,
  RotateCcw,
  Sparkles,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  ARENA_MAX_ROUNDS,
  ARENA_WINS_TO_WIN,
  ROLE_META,
  previewCounterBonuses,
  type ArenaCard,
} from "@/game/arena";
import { RARITY_INFO } from "@/game/rarity";
import type { ArenaRoomSnapshot } from "@/game/types";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { CharacterArt } from "@/components/character/CharacterArt";
import { Avatar } from "@/components/ui/Avatar";
import { FormError } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { arenaSound } from "./ArenaSound";
import { RoleIcon } from "./RoleIcon";

interface ArenaBattleBoardProps {
  snapshot: ArenaRoomSnapshot;
  isBotMatch?: boolean;
  onPlayCard: (cardId: string) => void;
  onLeave: () => void;
  onPlayAgain?: () => void;
  pendingCardId?: string | null;
  error?: string | null;
}

function ClashCardSlot({
  card,
  roleLabel,
  bonusRole,
  bonusAnime,
  totalPower,
  isWinner,
  emptyLabel,
  counterTag,
  animeTag,
}: {
  card: ArenaCard | null;
  roleLabel: string;
  bonusRole?: number;
  bonusAnime?: number;
  totalPower?: number;
  isWinner?: boolean;
  emptyLabel: string;
  counterTag?: string;
  animeTag?: string;
}) {
  const { locale } = useLanguage();
  if (!card) {
    return (
      <div className="flex h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-center">
        <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          {roleLabel}
        </span>
        <p className="mt-2 text-xs text-zinc-400">{emptyLabel}</p>
      </div>
    );
  }

  const meta = ROLE_META[card.role];
  const rarity = RARITY_INFO[card.rarity];

  return (
    <div
      className={cn(
        "relative flex h-36 items-stretch overflow-hidden rounded-2xl border bg-ink-950/95 transition duration-200",
        isWinner ? "border-emerald-400 shadow-[0_0_24px_-8px_rgba(52,211,153,0.6)]" : "border-white/15",
      )}
    >
      <div className="relative w-28 shrink-0 overflow-hidden bg-ink-900 sm:w-32">
        <CharacterArt name={card.name} animeId={card.animeId} imageUrl={card.imageUrl} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-ink-950/60" />
        <div className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: rarity.color }} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5">
        <div>
          <div className="flex items-start justify-between gap-2">
            <span className="rounded bg-white/10 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-zinc-200">
              {roleLabel}
            </span>
            <span className="font-display text-xl font-bold leading-none tabular-nums text-amber-300">
              {totalPower ?? card.powerLevel}
            </span>
          </div>
          <div className="mt-2 truncate font-display text-base font-bold text-white">{card.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: meta.color }}>
              <RoleIcon role={card.role} className="h-3.5 w-3.5 shrink-0" />
              {meta.label[locale]}
            </span>
            <span>·</span>
            <span className="truncate">{card.animeName}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-display font-semibold tabular-nums">
          <span className="text-zinc-400">Base {card.powerLevel}</span>
          {bonusRole && bonusRole > 0 && counterTag ? (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">{counterTag}</span>
          ) : null}
          {bonusAnime && bonusAnime > 0 && animeTag ? (
            <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-200">{animeTag}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ArenaBattleBoard({
  snapshot,
  isBotMatch = false,
  onPlayCard,
  onLeave,
  onPlayAgain,
  pendingCardId,
  error,
}: ArenaBattleBoardProps) {
  const { locale, t } = useLanguage();
  const [muted, setMuted] = useState(() => arenaSound.isMuted());
  const [copiedCode, setCopiedCode] = useState(false);

  const prevRoundCount = useRef(snapshot.history.length);
  const prevPhase = useRef(snapshot.phase);

  // Sync body[data-state] for clean game-state telemetry
  useEffect(() => {
    const state =
      snapshot.phase === "FINISHED"
        ? "gameover"
        : snapshot.phase === "LOBBY"
          ? "title"
          : "playing";
    document.body.dataset.state = state;
    return () => {
      delete document.body.dataset.state;
    };
  }, [snapshot.phase]);

  // Keyboard [M] mute toggle
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "m" || e.key === "M") {
        setMuted((prev) => {
          const next = !prev;
          arenaSound.setMuted(next);
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Sound cues on clash resolution and match end
  useEffect(() => {
    const mySeat = snapshot.mySeat;
    if (snapshot.history.length > prevRoundCount.current && snapshot.lastResolution) {
      arenaSound.playClash();
      if (mySeat !== null) {
        if (snapshot.lastResolution.winnerSeat === mySeat) arenaSound.playRoundResult("win");
        else if (snapshot.lastResolution.winnerSeat === null) arenaSound.playRoundResult("draw");
        else arenaSound.playRoundResult("lose");
      }
    }
    prevRoundCount.current = snapshot.history.length;

    if (prevPhase.current !== "FINISHED" && snapshot.phase === "FINISHED" && mySeat !== null) {
      const me = snapshot.players.find((p) => p.seat === mySeat);
      arenaSound.playMatchEnd(Boolean(me && snapshot.winnerId === me.userId));
    }
    prevPhase.current = snapshot.phase;
  }, [snapshot]);

  const mySeat = snapshot.mySeat;
  const me = mySeat !== null ? snapshot.players.find((p) => p.seat === mySeat) ?? snapshot.players[0] : snapshot.players[0];
  const opp = mySeat !== null ? snapshot.players.find((p) => p.seat !== mySeat) ?? null : snapshot.players[1] ?? null;

  const defenderSeat: 0 | 1 = snapshot.attackerSeat === 0 ? 1 : 0;
  const isMyAttack = snapshot.phase === "ATTACK" && mySeat === snapshot.attackerSeat;
  const isMyDefend = snapshot.phase === "DEFEND" && mySeat === defenderSeat;
  const isMyTurn = isMyAttack || isMyDefend;

  const showReveal = snapshot.phase === "ROUND_REVEAL" || (snapshot.phase === "FINISHED" && snapshot.lastResolution !== null);
  const activeAttackCard = showReveal && snapshot.lastResolution ? snapshot.lastResolution.attackerCard : snapshot.attackerCard;
  const activeDefendCard = showReveal && snapshot.lastResolution ? snapshot.lastResolution.defenderCard : null;

  function toggleMute() {
    setMuted((prev) => {
      const next = !prev;
      arenaSound.setMuted(next);
      return next;
    });
  }

  const [copiedLink, setCopiedLink] = useState(false);
  const [inviteUrl, setInviteUrl] = useState(`/arena/${snapshot.code}`);
  useEffect(() => setInviteUrl(`${window.location.origin}/arena/${snapshot.code}`), [snapshot.code]);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // ignore clipboard block
    }
  }

  async function shareInviteLink() {
    try {
      await navigator.share({ title: "Anime Debate", text: t.arena.shareText(snapshot.code), url: inviteUrl });
    } catch {
      // cancelled or unsupported: fall back to copying
      await copyInviteLink();
    }
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(snapshot.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // ignore clipboard block
    }
  }

  // Phase prompt text
  let phaseHint: string = t.arena.phaseLobby;
  if (snapshot.phase === "ATTACK") {
    phaseHint = isMyAttack ? t.arena.phaseAttackYou : t.arena.phaseAttackOpp;
  } else if (snapshot.phase === "DEFEND") {
    phaseHint = isMyDefend ? t.arena.phaseDefendYou : t.arena.phaseDefendOpp;
  } else if (snapshot.phase === "ROUND_REVEAL") {
    phaseHint = t.arena.phaseReveal;
  } else if (snapshot.phase === "FINISHED") {
    phaseHint = t.arena.phaseFinished;
  }

  const isVictory = Boolean(me && snapshot.winnerId === me.userId);
  const isDraw = snapshot.phase === "FINISHED" && snapshot.winnerId === null;

  return (
    <div className="space-y-5" data-testid="arena-battle-board">
      {/* Top Match HUD Bar */}
      <div className="glass-strong flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-500/25 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onLeave}
            className="btn btn-ghost min-h-[40px] !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
            data-testid="arena-leave-btn"
          >
            <ArrowLeft className="h-4 w-4" /> {t.arena.leaveMatch}
          </button>
          <div className="text-xs text-zinc-300">
            <span className="font-display font-bold text-white tabular-nums">
              {t.arena.roundLabel(snapshot.roundNumber, ARENA_MAX_ROUNDS)}
            </span>
            <span className="mx-2 text-zinc-500">·</span>
            <span className="text-zinc-400">{t.arena.firstToWins(ARENA_WINS_TO_WIN)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isBotMatch && (
            <button
              type="button"
              onClick={() => void copyRoomCode()}
              className="btn btn-ghost min-h-[40px] !px-3 !py-1.5 !text-xs font-display tracking-widest whitespace-nowrap shrink-0"
              data-testid="arena-room-code"
            >
              {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedCode ? t.arena.copied : snapshot.code}</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? t.arena.unmuteAudio : t.arena.muteAudio}
            title={muted ? t.arena.unmuteAudio : t.arena.muteAudio}
            className="btn btn-ghost min-h-[40px] !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
            data-testid="arena-mute-btn"
          >
            {muted ? <VolumeX className="h-4 w-4 text-zinc-400" /> : <Volume2 className="h-4 w-4 text-purple-300" />}
          </button>
        </div>
      </div>

      {/* Lobby Waiting Card */}
      {snapshot.phase === "LOBBY" ? (
        <div className="glass-strong rounded-3xl border border-purple-500/30 p-8 text-center">
          <Swords className="mx-auto h-10 w-10 text-purple-300 animate-pulse" />
          <h2 className="mt-4 font-display text-2xl font-bold text-white">{t.arena.phaseLobby}</h2>
          <div className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-5 py-3">
            <span className="font-display text-2xl font-bold tracking-[0.25em] text-purple-200">{snapshot.code}</span>
            <button
              type="button"
              onClick={() => void copyRoomCode()}
              className="btn btn-primary min-h-[38px] !px-3 !py-1.5 !text-xs"
            >
              {copiedCode ? t.arena.copied : t.arena.copyCode}
            </button>
          </div>
          <div className="mx-auto mt-5 max-w-xl text-left">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{t.arena.inviteLink}</div>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="input min-w-0 flex-1 !py-2 text-sm"
                aria-label={t.arena.inviteLink}
                data-testid="arena-invite-link"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => void copyInviteLink()} className="btn btn-primary flex-1 !py-2 !text-xs sm:flex-none" data-testid="arena-copy-link">
                  {copiedLink ? t.arena.copied : t.arena.copyLink}
                </button>
                {canShare && (
                  <button type="button" onClick={() => void shareInviteLink()} className="btn btn-ghost flex-1 !py-2 !text-xs sm:flex-none">
                    {t.arena.shareLink}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{t.arena.inviteHint}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Opponent Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-ink-900/95 px-4 py-2.5 shadow-lg">
            <div className="flex items-center gap-3">
              {isBotMatch ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/15 text-rose-300">
                  <Bot className="h-5 w-5" />
                </div>
              ) : opp ? (
                <Avatar username={opp.username} style={opp.avatar.style} imageUrl={opp.avatar.imageUrl} size={40} />
              ) : null}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-bold text-white">
                    {opp ? opp.username : t.arena.opponentLabel}
                  </span>
                  {opp && !opp.connected && !isBotMatch && (
                    <span className="text-[11px] text-amber-300">Offline</span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 tabular-nums">
                  {opp ? t.arena.oppHandHidden(opp.cardsRemaining) : null}
                </p>
              </div>
            </div>

            {/* Hidden Card Backs + Opponent Score */}
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
                {Array.from({ length: opp?.cardsRemaining ?? 0 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex h-9 w-6 items-center justify-center rounded border border-white/15 bg-gradient-to-b from-purple-950/70 to-ink-950"
                  >
                    <EyeOff className="h-3 w-3 text-purple-300/60" />
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-1.5 text-center">
                <div className="text-[10px] font-display uppercase tracking-wider text-rose-200/80">
                  {opp?.username ?? t.arena.opponentLabel}
                </div>
                <div className="font-display text-xl font-bold tabular-nums text-white" data-testid="arena-opp-score">
                  {opp?.score ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* Center Clash Arena */}
          <div className="glass-strong rounded-3xl border border-white/10 p-4 sm:p-6">
            {/* Phase Banner */}
            <div
              className={cn(
                "mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm font-display font-semibold",
                isMyTurn
                  ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.03] text-zinc-200",
              )}
              data-testid="arena-phase-banner"
            >
              <span>{phaseHint}</span>
              {snapshot.lastResolution && showReveal ? (
                <span className="text-xs uppercase tracking-wider text-amber-300">
                  {snapshot.lastResolution.winnerSeat === null
                    ? t.arena.roundDraw
                    : snapshot.lastResolution.winnerSeat === mySeat
                      ? t.arena.roundWinnerYou
                      : t.arena.roundWinnerOpp}
                </span>
              ) : null}
            </div>

            {/* 2-Card Clash Stage */}
            <div className="grid items-center gap-4 md:grid-cols-11">
              <div className="md:col-span-5">
                <ClashCardSlot
                  card={activeAttackCard}
                  roleLabel={t.arena.attackerSlot}
                  bonusRole={showReveal ? snapshot.lastResolution?.attackerRoleBonus : undefined}
                  totalPower={showReveal ? snapshot.lastResolution?.attackerTotal : activeAttackCard?.powerLevel}
                  isWinner={
                    Boolean(
                      showReveal &&
                        snapshot.lastResolution &&
                        snapshot.lastResolution.winnerSeat === snapshot.lastResolution.attackerSeat,
                    )
                  }
                  emptyLabel={t.arena.waitingCard}
                  counterTag={
                    showReveal && snapshot.lastResolution?.attackerRoleBonus
                      ? t.arena.counterBonusTag(snapshot.lastResolution.attackerRoleBonus)
                      : undefined
                  }
                />
              </div>

              <div className="flex flex-col items-center justify-center py-2 text-center md:col-span-1">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-purple-400/40 bg-purple-500/15 font-display text-sm font-bold text-purple-200">
                  VS
                </div>
              </div>

              <div className="md:col-span-5">
                <ClashCardSlot
                  card={activeDefendCard}
                  roleLabel={t.arena.defenderSlot}
                  bonusRole={showReveal ? snapshot.lastResolution?.defenderRoleBonus : undefined}
                  bonusAnime={showReveal ? snapshot.lastResolution?.defenderAnimeBonus : undefined}
                  totalPower={showReveal ? snapshot.lastResolution?.defenderTotal : undefined}
                  isWinner={
                    Boolean(
                      showReveal &&
                        snapshot.lastResolution &&
                        snapshot.lastResolution.winnerSeat === snapshot.lastResolution.defenderSeat,
                    )
                  }
                  emptyLabel={t.arena.waitingCard}
                  counterTag={
                    showReveal && snapshot.lastResolution?.defenderRoleBonus
                      ? t.arena.counterBonusTag(snapshot.lastResolution.defenderRoleBonus)
                      : undefined
                  }
                  animeTag={
                    showReveal && snapshot.lastResolution?.defenderAnimeBonus
                      ? t.arena.animeBonusTag(snapshot.lastResolution.defenderAnimeBonus)
                      : undefined
                  }
                />
              </div>
            </div>

            <FormError message={error ?? null} />

            {/* Finished Match Summary Panel */}
            {snapshot.phase === "FINISHED" && (
              <div
                className="mt-5 rounded-2xl border border-purple-400/35 bg-ink-950/95 p-5 text-center animate-slide-up"
                data-testid="arena-match-summary"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20 text-amber-300">
                  {isVictory ? <Crown className="h-6 w-6" /> : <Trophy className="h-6 w-6" />}
                </div>
                <h3
                  className={cn(
                    "mt-3 font-display text-3xl font-bold tracking-wider",
                    isVictory ? "text-emerald-300" : isDraw ? "text-amber-300" : "text-rose-300",
                  )}
                >
                  {isVictory ? t.arena.victoryTitle : isDraw ? t.arena.drawTitle : t.arena.defeatTitle}
                </h3>
                <p className="mt-1 font-display text-base font-semibold tabular-nums text-white">
                  {me?.username ?? t.arena.youLabel} {me?.score ?? 0} — {opp?.score ?? 0}{" "}
                  {opp?.username ?? t.arena.opponentLabel}
                </p>
                {snapshot.xpAwarded !== null && snapshot.xpAwarded > 0 && (
                  <p
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-purple-200 tabular-nums"
                    data-testid="arena-xp-awarded"
                  >
                    <Sparkles className="h-4 w-4 text-amber-300" /> {t.arena.xpEarned(snapshot.xpAwarded)}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  {onPlayAgain && (
                    <button
                      type="button"
                      onClick={onPlayAgain}
                      className="btn btn-primary min-h-[44px] whitespace-nowrap shrink-0"
                      data-testid="arena-play-again"
                    >
                      <RotateCcw className="h-4 w-4" /> {t.arena.playAgain}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onLeave}
                    className="btn btn-ghost min-h-[44px] whitespace-nowrap shrink-0"
                  >
                    {t.arena.backToBuilder}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Player Hand & Score Bar */}
          {mySeat !== null ? (
            <section className="rounded-3xl border border-white/10 bg-ink-900/95 p-4 shadow-xl sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {me && (
                    <Avatar username={me.username} style={me.avatar.style} imageUrl={me.avatar.imageUrl} size={38} />
                  )}
                  <div>
                    <h3 className="font-display text-sm font-bold text-white">
                      {t.arena.yourHandTitle(snapshot.myHand.length)}
                    </h3>
                    <p className="text-xs text-zinc-400">{me?.username ?? t.arena.youLabel}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-1.5 text-center">
                  <div className="text-[10px] font-display uppercase tracking-wider text-emerald-200/80">
                    {t.arena.youLabel}
                  </div>
                  <div className="font-display text-xl font-bold tabular-nums text-white" data-testid="arena-my-score">
                    {me?.score ?? 0}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5" data-testid="arena-my-hand">
                {snapshot.myHand.map((card) => {
                  const meta = ROLE_META[card.role];
                  const preview =
                    isMyDefend && snapshot.attackerCard
                      ? previewCounterBonuses(snapshot.attackerCard, card)
                      : null;
                  const canBeat = preview ? preview.defenderTotal > preview.attackerTotal : false;
                  const ties = preview ? preview.defenderTotal === preview.attackerTotal : false;
                  const disabled = !isMyTurn || Boolean(pendingCardId);

                  return (
                    <button
                      key={card.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        arenaSound.playSelect();
                        onPlayCard(card.id);
                      }}
                      className={cn(
                        "group relative flex min-h-[168px] flex-col overflow-hidden rounded-2xl border bg-ink-900/90 text-left transition",
                        isMyTurn
                          ? canBeat
                            ? "border-emerald-400/70 hover:-translate-y-1 hover:shadow-[0_12px_28px_-10px_rgba(52,211,153,0.5)]"
                            : "border-purple-400/45 hover:-translate-y-1 hover:border-purple-300"
                          : "border-white/10 opacity-70 cursor-not-allowed",
                      )}
                      data-testid={`arena-hand-card-${card.id}`}
                    >
                      <div className="relative h-24 w-full overflow-hidden bg-ink-950">
                        <CharacterArt name={card.name} animeId={card.animeId} imageUrl={card.imageUrl} />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />
                        <div className="absolute right-2 top-2 rounded bg-black/85 px-1.5 py-0.5 font-display text-xs font-bold tabular-nums text-amber-300">
                          {preview ? preview.defenderTotal : card.powerLevel}
                        </div>
                        {preview && (
                          <div
                            className={cn(
                              "absolute left-2 top-2 rounded px-1.5 py-0.5 font-display text-[10px] font-bold uppercase",
                              canBeat
                                ? "bg-emerald-500/90 text-ink-950"
                                : ties
                                  ? "bg-amber-400/90 text-ink-950"
                                  : "bg-zinc-800/90 text-zinc-200",
                            )}
                          >
                            {canBeat ? t.arena.willBeatPreview : ties ? t.arena.willTiePreview : t.arena.willLosePreview}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col justify-between p-2.5">
                        <div>
                          <div className="line-clamp-1 font-display text-xs font-bold text-white">{card.name}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: meta.color }}>
                            <RoleIcon role={card.role} className="h-3 w-3 shrink-0" />
                            <span className="truncate font-semibold">{meta.label[locale]}</span>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] font-display font-semibold tabular-nums text-zinc-400">
                          <span className="truncate">{card.animeName}</span>
                          {preview && preview.defenderRoleBonus > 0 && (
                            <span className="text-emerald-300">· +{preview.defenderRoleBonus}</span>
                          )}
                          {preview && preview.defenderAnimeBonus > 0 && (
                            <span className="text-purple-300">· +{preview.defenderAnimeBonus}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="glass rounded-2xl border border-white/10 p-4 text-center text-xs text-zinc-400">
              {t.arena.spectatingNote}
            </div>
          )}

          {/* Round History Strip */}
          {snapshot.history.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-ink-900/95 p-4 shadow-lg">
              <h3 className="mb-2.5 font-display text-xs font-semibold uppercase tracking-widest text-zinc-400">
                {t.arena.roundHistory}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {snapshot.history.map((h) => {
                  const iWon = mySeat !== null && h.winnerSeat === mySeat;
                  const draw = h.winnerSeat === null;
                  return (
                    <div
                      key={h.roundNumber}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-xs tabular-nums",
                        iWon
                          ? "border-emerald-500/35 bg-emerald-500/10"
                          : draw
                            ? "border-amber-400/30 bg-amber-500/10"
                            : "border-white/10 bg-white/[0.02]",
                      )}
                    >
                      <div className="flex items-center justify-between font-display font-bold text-zinc-300">
                        <span>T{h.roundNumber}</span>
                        <span>
                          {h.attackerTotal} vs {h.defenderTotal}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-zinc-400">
                        {h.attackerCard.name} / {h.defenderCard.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
