"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  KeyRound,
  Plus,
  Search,
  Shuffle,
  Sparkles,
  Swords,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  DECK_MAX_POWER,
  DECK_SIZE,
  ROLE_META,
  buildAutoDeck,
  type ArenaCard,
  type TacticalRole,
} from "@/game/arena";
import { RARITY_INFO } from "@/game/rarity";
import type { OpenArenaRoomDTO } from "@/game/types";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { CharacterArt } from "@/components/character/CharacterArt";
import { Avatar } from "@/components/ui/Avatar";
import { FormError } from "@/components/ui/primitives";
import { cn, timeAgo } from "@/lib/utils";
import { RoleIcon } from "./RoleIcon";

const ROLE_ORDER: TacticalRole[] = ["TACTICIAN", "VANGUARD", "BLITZ", "BREAKER"];

interface DeckBuilderPanelProps {
  playableCards: ArenaCard[];
  ownedIdSet: Set<string>;
  selectedDeckIds: string[];
  onChangeDeck: (ids: string[]) => void;
  onStartBotMatch: () => void;
  onCreatePvpRoom: () => Promise<void>;
  onJoinPvpRoom: (code: string) => Promise<void>;
  openRooms: OpenArenaRoomDTO[];
  socketConnected: boolean;
  pvpPending: boolean;
  error: string | null;
}

export function DeckBuilderPanel({
  playableCards,
  ownedIdSet,
  selectedDeckIds,
  onChangeDeck,
  onStartBotMatch,
  onCreatePvpRoom,
  onJoinPvpRoom,
  openRooms,
  socketConnected,
  pvpPending,
  error,
}: DeckBuilderPanelProps) {
  const { locale, t } = useLanguage();
  const [poolFilter, setPoolFilter] = useState<"ALL" | "OWNED" | "STARTER">("ALL");
  const [roleFilter, setRoleFilter] = useState<"ALL" | TacticalRole>("ALL");
  const [query, setQuery] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const byId = useMemo(() => new Map(playableCards.map((c) => [c.id, c])), [playableCards]);
  const selectedCards = useMemo(
    () => selectedDeckIds.map((id) => byId.get(id)).filter((c): c is ArenaCard => Boolean(c)),
    [selectedDeckIds, byId],
  );
  const selectedSet = useMemo(() => new Set(selectedDeckIds), [selectedDeckIds]);

  const totalPower = selectedCards.reduce((sum, c) => sum + c.powerLevel, 0);
  const overBudget = totalPower > DECK_MAX_POWER;
  const deckReady = selectedCards.length === DECK_SIZE && !overBudget;
  const budgetPct = Math.min(100, Math.round((totalPower / DECK_MAX_POWER) * 100));

  const filteredPool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return playableCards.filter((card) => {
      const isOwned = ownedIdSet.has(card.id);
      if (poolFilter === "OWNED" && !isOwned) return false;
      if (poolFilter === "STARTER" && !card.isStarter) return false;
      if (roleFilter !== "ALL" && card.role !== roleFilter) return false;
      if (q) {
        const hay = `${card.name} ${card.title} ${card.animeName} ${card.primeForm ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [playableCards, ownedIdSet, poolFilter, roleFilter, query]);

  function toggleCard(id: string) {
    if (selectedSet.has(id)) {
      onChangeDeck(selectedDeckIds.filter((x) => x !== id));
    } else if (selectedDeckIds.length < DECK_SIZE) {
      onChangeDeck([...selectedDeckIds, id]);
    }
  }

  function handleAutoBuild() {
    const auto = buildAutoDeck(playableCards, Math.random);
    onChangeDeck(auto.map((c) => c.id));
  }

  return (
    <div className="space-y-6">
      {/* 4-Way Counter Cycle Reference Strip */}
      <section className="rounded-2xl border border-white/10 bg-ink-900/95 p-4 shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
              {t.arena.counterCycleTitle}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              {t.arena.counterCycleRule} <span className="text-purple-300">{t.arena.sameAnimeRule}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {ROLE_ORDER.map((role, idx) => {
              const meta = ROLE_META[role];
              return (
                <div key={role} className="flex items-center gap-2">
                  <div
                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-display font-semibold"
                    style={{ borderColor: `${meta.color}45`, backgroundColor: `${meta.color}14`, color: meta.color }}
                  >
                    <RoleIcon role={role} className="h-3.5 w-3.5 shrink-0" />
                    <span className="whitespace-nowrap">{meta.label[locale]}</span>
                  </div>
                  {idx < ROLE_ORDER.length - 1 ? (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                  )}
                </div>
              );
            })}
            <span className="font-display text-[11px] font-semibold text-purple-300">
              {ROLE_META.TACTICIAN.label[locale]} (+12)
            </span>
          </div>
        </div>
      </section>

      {/* Main Split: 5-Card Deck Dock & Mode Actions + Pool Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left/Top: 5-Card Deck Dock + Battle Launch */}
        <section className="glass-strong rounded-3xl border border-purple-500/25 p-5 lg:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-white">{t.arena.deckDockTitle}</h2>
              <p className="text-xs text-zinc-400">
                {selectedCards.length} / {DECK_SIZE} · {t.arena.budgetLabel}:{" "}
                <span className={cn("font-display font-bold tabular-nums", overBudget ? "text-rose-400" : "text-emerald-300")}>
                  {totalPower} / {DECK_MAX_POWER}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoBuild}
                className="btn btn-ghost min-h-[40px] !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                data-testid="arena-auto-deck"
              >
                <Shuffle className="h-3.5 w-3.5" /> {t.arena.autoBuild}
              </button>
              <button
                type="button"
                onClick={() => onChangeDeck([])}
                disabled={selectedDeckIds.length === 0}
                className="btn btn-ghost min-h-[40px] !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t.arena.clearDeck}
              </button>
            </div>
          </div>

          {/* Power budget bar */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-sm bg-white/10">
            <div
              className={cn("h-full transition-all duration-300", overBudget ? "bg-rose-500" : "bg-gradient-to-r from-purple-500 to-emerald-400")}
              style={{ width: `${budgetPct}%` }}
            />
          </div>

          {/* 5 Deck Slots */}
          <div className="mt-4 space-y-2" data-testid="arena-deck-slots">
            {Array.from({ length: DECK_SIZE }).map((_, slotIdx) => {
              const card = selectedCards[slotIdx];
              if (!card) {
                return (
                  <div
                    key={`empty-${slotIdx}`}
                    className="flex min-h-[56px] items-center justify-between rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3.5 text-xs text-zinc-500"
                  >
                    <span>Slot #{slotIdx + 1}</span>
                    <span>—</span>
                  </div>
                );
              }
              const roleMeta = ROLE_META[card.role];
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => toggleCard(card.id)}
                  className="group flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-white/15 bg-ink-900/90 px-3 py-2 text-left transition hover:border-rose-400/50"
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                    <CharacterArt name={card.name} animeId={card.animeId} imageUrl={card.imageUrl} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm font-semibold text-white">{card.name}</div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <span className="inline-flex items-center gap-1 font-medium" style={{ color: roleMeta.color }}>
                        <RoleIcon role={card.role} className="h-3 w-3 shrink-0" />
                        {roleMeta.label[locale]}
                      </span>
                      <span>·</span>
                      <span className="truncate">{card.animeName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-display text-sm font-bold tabular-nums text-amber-300">
                      {card.powerLevel}
                    </span>
                    <X className="h-4 w-4 text-zinc-500 transition group-hover:text-rose-400" />
                  </div>
                </button>
              );
            })}
          </div>

          {!deckReady && (
            <p className={cn("mt-3 text-xs font-medium", overBudget ? "text-rose-300" : "text-amber-300")}>
              {overBudget ? t.arena.overBudgetMsg : t.arena.needFiveCards}
            </p>
          )}

          {/* Action CTAs */}
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              disabled={!deckReady}
              onClick={onStartBotMatch}
              className="btn btn-primary min-h-[46px] w-full whitespace-nowrap shrink-0"
              data-testid="arena-start-bot"
            >
              <Bot className="h-4 w-4 shrink-0" /> {t.arena.playVsBot}
            </button>
            <button
              type="button"
              disabled={!deckReady || !socketConnected || pvpPending}
              onClick={() => void onCreatePvpRoom()}
              className="btn btn-ghost min-h-[46px] w-full border-purple-400/35 whitespace-nowrap shrink-0"
              data-testid="arena-create-pvp"
            >
              <Swords className="h-4 w-4 shrink-0 text-purple-300" /> {t.arena.createPvpRoom}
            </button>
          </div>

          <FormError message={error} />

          {/* Join by Code + Open PvP Rooms */}
          <div className="mt-5 border-t border-white/10 pt-4">
            <label className="mb-2 flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-zinc-300">
              <KeyRound className="h-3.5 w-3.5 text-sky-300" /> {t.arena.joinByCode}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder={t.arena.codePlaceholder}
                className="input min-h-[44px] font-display tracking-widest uppercase"
                data-testid="arena-join-code-input"
              />
              <button
                type="button"
                disabled={!deckReady || !socketConnected || pvpPending || joinCode.trim().length < 6}
                onClick={() => void onJoinPvpRoom(joinCode.trim())}
                className="btn btn-ghost min-h-[44px] whitespace-nowrap shrink-0"
                data-testid="arena-join-code-btn"
              >
                {t.arena.joinRoomBtn}
              </button>
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="mb-2.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-display font-semibold uppercase tracking-wider text-zinc-300">
                <Users className="h-3.5 w-3.5 text-emerald-300" /> {t.arena.openPvpRooms}
              </span>
              <span className="font-display tabular-nums text-zinc-400">{openRooms.length}</span>
            </div>
            {openRooms.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-zinc-400">
                {t.arena.noOpenPvpRooms}
              </p>
            ) : (
              <div className="space-y-2">
                {openRooms.map((r) => (
                  <div
                    key={r.code}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <Avatar username={r.host.username} style={r.host.avatar.style} imageUrl={r.host.avatar.imageUrl} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-display text-sm font-semibold text-white">{r.host.username}</span>
                        <span className="font-display text-[11px] tracking-widest text-zinc-400">{r.code}</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 tabular-nums">
                        {r.totalPower} / {DECK_MAX_POWER} · {timeAgo(r.createdAt, locale)}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!deckReady || !socketConnected || pvpPending}
                      onClick={() => void onJoinPvpRoom(r.code)}
                      className="btn btn-primary min-h-[38px] !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                    >
                      {t.arena.joinRoomBtn}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right: Playable Character Pool */}
        <section className="rounded-3xl border border-white/10 bg-ink-900/95 p-5 shadow-xl lg:col-span-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-white">{t.arena.poolTitle}</h2>
              <p className="text-xs text-zinc-400 tabular-nums">
                {ownedIdSet.size} {t.arena.ownedBadge} · {playableCards.length} total
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.arena.searchPlaceholder}
                className="input min-h-[42px] !pl-9 text-sm"
              />
            </div>
          </div>

          {/* Pool & Role Filters */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(
              [
                ["ALL", t.arena.filterAll],
                ["OWNED", t.arena.filterOwned],
                ["STARTER", t.arena.filterStarter],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPoolFilter(key)}
                className={cn(
                  "min-h-[36px] rounded-lg border px-3 text-xs font-display font-semibold uppercase tracking-wider transition whitespace-nowrap shrink-0",
                  poolFilter === key
                    ? "border-purple-400/70 bg-purple-500/20 text-white"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white",
                )}
              >
                {label}
              </button>
            ))}

            <span className="mx-1 h-4 w-px bg-white/10" />

            <button
              type="button"
              onClick={() => setRoleFilter("ALL")}
              className={cn(
                "min-h-[36px] rounded-lg border px-2.5 text-xs font-display font-semibold transition whitespace-nowrap shrink-0",
                roleFilter === "ALL"
                  ? "border-white/40 bg-white/10 text-white"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white",
              )}
            >
              {t.arena.filterAll}
            </button>
            {ROLE_ORDER.map((r) => {
              const meta = ROLE_META[r];
              const active = roleFilter === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={cn(
                    "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-display font-semibold transition whitespace-nowrap shrink-0",
                    active ? "text-white" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white",
                  )}
                  style={active ? { borderColor: meta.color, backgroundColor: `${meta.color}25` } : undefined}
                >
                  <RoleIcon role={r} className="h-3.5 w-3.5 shrink-0" />
                  <span>{meta.label[locale]}</span>
                </button>
              );
            })}
          </div>

          {/* Pool Cards Grid */}
          <div className="mt-4 grid max-h-[620px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {filteredPool.map((card) => {
              const picked = selectedSet.has(card.id);
              const disabledAdd = !picked && selectedDeckIds.length >= DECK_SIZE;
              const isOwned = ownedIdSet.has(card.id);
              const roleMeta = ROLE_META[card.role];
              const rarityInfo = RARITY_INFO[card.rarity];

              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={disabledAdd}
                  onClick={() => toggleCard(card.id)}
                  className={cn(
                    "group relative flex min-h-[96px] items-stretch gap-3 rounded-2xl border p-2.5 text-left transition",
                    picked
                      ? "border-emerald-400/70 bg-emerald-500/10"
                      : "border-white/10 bg-ink-950/90 hover:border-purple-400/50",
                    disabledAdd && "opacity-45 cursor-not-allowed",
                  )}
                  data-testid={`arena-pool-card-${card.id}`}
                >
                  <div className="relative w-16 shrink-0 overflow-hidden rounded-xl bg-ink-950">
                    <CharacterArt name={card.name} animeId={card.animeId} imageUrl={card.imageUrl} />
                    <div
                      className="absolute inset-x-0 bottom-0 h-0.5"
                      style={{ backgroundColor: rarityInfo.color }}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate font-display text-sm font-bold text-white">{card.name}</span>
                        <span className="font-display text-sm font-bold tabular-nums text-amber-300 shrink-0">
                          {card.powerLevel}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-zinc-400">
                        {card.primeForm ?? card.title}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex min-w-0 items-center gap-1 font-medium" style={{ color: roleMeta.color }}>
                        <RoleIcon role={card.role} className="h-3 w-3 shrink-0" />
                        <span className="truncate">{roleMeta.label[locale]}</span>
                      </span>
                      <span className="flex items-center gap-1 text-zinc-400 shrink-0 whitespace-nowrap">
                        {isOwned ? <Sparkles className="h-3 w-3 text-purple-300" /> : null}
                        <span>{isOwned ? t.arena.ownedBadge : t.arena.starterBadge}</span>
                        {picked ? (
                          <Check className="ml-0.5 h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Plus className="ml-0.5 h-3.5 w-3.5 text-zinc-500 group-hover:text-white" />
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
