"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Crosshair,
  Flag,
  Hourglass,
  Loader2,
  Search,
  Share2,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  WifiOff,
  Zap,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { api, isNetworkFailure } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { ENABLED_ANIME, getAnime } from "@/data/anime";
import { RARITY_INFO, rarityRank, type Rarity } from "@/game/rarity";
import type { Archetype, FighterKit } from "@/game/versus/kit";
import { MAX_ENERGY, MAX_TURNS, moveError, type FighterState, type Move, type TurnLog, type TurnSide } from "@/game/versus/engine";
import type { VersusSeatView, VersusSnapshot } from "@/server/versus/service";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { CharacterArt } from "@/components/character/CharacterArt";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorState, FormError, Spinner } from "@/components/ui/primitives";
import { VERSUS_TEXT, abilityDescription, abilityName, eventText, moveName, type VersusTexts } from "./texts";

/** Kept in sync with the server's TURN_MS (client code must not import the server module). */
const TURN_SECONDS = 25;

export interface RosterItem extends FighterKit {
  rarity: string;
  powerLevel: number | null;
}

const ARCH_COLOR: Record<Archetype, string> = {
  TANK: "#60a5fa",
  BLITZ: "#facc15",
  POWER: "#f87171",
  TACTIC: "#a78bfa",
};

type Action =
  | { action: "sync" }
  | { action: "join" }
  | { action: "pick"; characterId: string }
  | { action: "move"; move: Move; turn: number }
  | { action: "leave" }
  | { action: "rematch" };

export function VersusRoom({ code, userId, roster }: { code: string; userId: string; roster: RosterItem[] }) {
  const { locale } = useLanguage();
  const t = VERSUS_TEXT[locale];
  const router = useRouter();
  const [snap, setSnap] = useState<VersusSnapshot | null>(null);
  const [fatal, setFatal] = useState<{ message: string; activeCode?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [netDown, setNetDown] = useState(false);
  const [pending, setPending] = useState(false);
  const [wantRematch, setWantRematch] = useState(false);
  const offset = useRef(0);
  const seq = useRef(0);
  const applied = useRef(0);
  const phaseRef = useRef<string | null>(null);
  const modeRef = useRef<string | null>(null);
  const [, setTick] = useState(0);

  const send = useCallback(
    async (act: Action) => {
      const mine = ++seq.current;
      const res = await api<VersusSnapshot>(`/api/versus/matches/${code}`, { body: act });
      if (res.ok) {
        setNetDown(false);
        if (mine > applied.current) {
          applied.current = mine;
          offset.current = res.data.serverNow - Date.now();
          phaseRef.current = res.data.phase;
          modeRef.current = res.data.mode;
          setSnap(res.data);
        }
      } else if (isNetworkFailure(res)) {
        setNetDown(true);
      }
      return res;
    },
    [code],
  );

  // Join once, then keep the match in sync.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async (first: boolean) => {
      const res = await send(first ? { action: "join" } : { action: "sync" });
      if (stopped) return;
      if (!res.ok && !isNetworkFailure(res) && (first || res.code === "NOT_FOUND")) {
        setFatal({ message: res.message, activeCode: res.data?.code });
        return;
      }
      const phase = phaseRef.current;
      if (phase === "ABANDONED") return;
      if (phase === "FINISHED" && modeRef.current !== "friendly") return;
      const delay = phase === "FINISHED" ? 2500 : document.hidden ? 4000 : 1000;
      timer = setTimeout(() => void loop(false), delay);
    };
    void loop(true);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [send]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Follow a rematch once it's created.
  useEffect(() => {
    if (!snap?.rematchCode) return;
    if (wantRematch || snap.rematchVotes.includes(userId)) router.push(`/versus/${snap.rematchCode}`);
  }, [snap?.rematchCode, snap?.rematchVotes, wantRematch, userId, router]);

  const act = useCallback(
    async (a: Action) => {
      setError(null);
      setPending(true);
      const res = await send(a);
      setPending(false);
      if (!res.ok && res.message) {
        setError(res.message);
        void send({ action: "sync" });
      }
      return res;
    },
    [send],
  );

  if (fatal) {
    return (
      <ErrorState
        title={fatal.message || t.notFound}
        action={
          <>
            {fatal.activeCode && (
              <Link href={`/versus/${fatal.activeCode}`} className="btn btn-primary">
                {t.backToMatch}
              </Link>
            )}
            <Link href="/versus" className="btn btn-ghost">
              {t.backToHub}
            </Link>
          </>
        }
      />
    );
  }
  if (!snap) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const serverNow = Date.now() + offset.current;
  const secondsLeft = snap.phaseEndsAt ? Math.max(0, Math.ceil((snap.phaseEndsAt - serverNow) / 1000)) : null;
  const meIdx = snap.mySeat ?? 0;
  const isPlayer = snap.mySeat !== null;
  const modeLabel =
    snap.mode === "ranked" ? t.ranked : snap.mode === "friendly" ? t.friendly : `${t.practice} · ${t.levels[snap.botLevel ?? "NORMAL"]}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-10" data-testid="versus-room" data-phase={snap.phase}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/versus" className="btn btn-ghost px-3 py-1.5 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.title}
        </Link>
        <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">{modeLabel}</span>
        <span className="font-display text-xs tracking-widest text-zinc-500">#{snap.code}</span>
        {netDown && (
          <span className="flex items-center gap-1 text-xs text-amber-300">
            <WifiOff className="h-3.5 w-3.5" /> {t.connectionLost}
          </span>
        )}
        {isPlayer && (snap.phase === "PICK" || snap.phase === "BATTLE") && (
          <ForfeitButton t={t} onConfirm={() => void act({ action: "leave" })} disabled={pending} />
        )}
      </div>
      {!isPlayer && snap.phase !== "LOBBY" && <p className="text-sm text-zinc-400">{t.spectating}</p>}
      <FormError message={error} />

      {snap.phase === "LOBBY" && (
        <LobbyView
          code={snap.code}
          t={t}
          onClose={async () => {
            await act({ action: "leave" });
            router.push("/versus");
          }}
        />
      )}
      {snap.phase === "ABANDONED" && (
        <ErrorState
          title={t.abandoned}
          action={
            <Link href="/versus" className="btn btn-primary">
              {t.backToHub}
            </Link>
          }
        />
      )}
      {snap.phase === "PICK" && (
        <PickView snap={snap} meIdx={meIdx} isPlayer={isPlayer} roster={roster} secondsLeft={secondsLeft} t={t} locale={locale} pending={pending} onPick={(id) => void act({ action: "pick", characterId: id })} />
      )}
      {(snap.phase === "BATTLE" || snap.phase === "FINISHED") && (
        <BattleView
          snap={snap}
          meIdx={meIdx}
          isPlayer={isPlayer}
          secondsLeft={secondsLeft}
          t={t}
          locale={locale}
          pending={pending}
          onMove={(move) => void act({ action: "move", move, turn: snap.turn })}
          onRematch={() => {
            setWantRematch(true);
            void act({ action: "rematch" });
          }}
          userId={userId}
        />
      )}
    </div>
  );
}

// ─── Lobby ──────────────────────────────────────────────────────────────────

function LobbyView({ code, t, onClose }: { code: string; t: VersusTexts; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? `/versus/${code}` : `${window.location.origin}/versus/${code}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section className="glass-strong mx-auto max-w-xl rounded-3xl p-6 text-center" data-testid="versus-lobby">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
      <h1 className="mt-3 font-display text-2xl font-bold text-white">{t.lobbyTitle}</h1>
      <p className="mt-1 text-sm text-zinc-400">{t.lobbyHint}</p>
      <div className="mt-5 font-display text-4xl font-bold tracking-[0.3em] text-white" data-testid="versus-code">
        {code}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
        <span className="min-w-0 flex-1 truncate text-left text-xs text-zinc-300" data-testid="versus-invite-link">
          {link}
        </span>
        <button type="button" className="btn btn-primary px-3 py-1.5 text-sm" onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t.copied : t.copyLink}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {canShare && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void navigator.share({ title: t.title, text: t.shareText(code), url: link }).catch(() => undefined)}
          >
            <Share2 className="h-4 w-4" /> {t.share}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t.closeRoom}
        </button>
      </div>
    </section>
  );
}

// ─── Draft ──────────────────────────────────────────────────────────────────

function PickView({
  snap,
  meIdx,
  isPlayer,
  roster,
  secondsLeft,
  t,
  locale,
  pending,
  onPick,
}: {
  snap: VersusSnapshot;
  meIdx: number;
  isPlayer: boolean;
  roster: RosterItem[];
  secondsLeft: number | null;
  t: VersusTexts;
  locale: Locale;
  pending: boolean;
  onPick: (id: string) => void;
}) {
  const me = snap.seats[meIdx];
  const opp = snap.seats[1 - meIdx];
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [anime, setAnime] = useState<string | null>(null);
  const [arch, setArch] = useState<Archetype | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US");
    return roster
      .filter((c) => (!anime || c.animeId === anime) && (!arch || c.archetype === arch) && (!q || c.name.toLocaleLowerCase().includes(q)))
      .sort((a, b) => rarityRank(b.rarity as Rarity) - rarityRank(a.rarity as Rarity) || a.name.localeCompare(b.name));
  }, [roster, query, anime, arch, locale]);
  const chosen = roster.find((c) => c.characterId === (me?.pick ?? selected)) ?? null;
  const locked = !!me?.picked;

  const status = (
    <div className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm">
      <Hourglass className="h-4 w-4 text-cyan-300" />
      <span className="font-display font-bold text-white">{t.pickTitle}</span>
      {secondsLeft !== null && (
        <span className={cn("rounded-full px-2 py-0.5 font-display text-xs font-bold tabular-nums", secondsLeft <= 10 ? "bg-rose-500/20 text-rose-200" : "bg-white/10 text-zinc-200")} data-testid="versus-timer">
          {t.timeLeft(secondsLeft)}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2 text-xs text-zinc-300">
        {opp && <Avatar username={opp.username} style={opp.avatar.style} imageUrl={opp.avatar.imageUrl} size={20} />}
        {opp?.picked ? (
          <span className="text-emerald-300" data-testid="versus-opponent-picked">
            <Check className="mr-1 inline h-3.5 w-3.5" />
            {t.opponentPicked}
          </span>
        ) : (
          <span className="text-zinc-400">{t.opponentPicking}</span>
        )}
      </span>
    </div>
  );

  if (!isPlayer) return status;

  if (locked && chosen) {
    return (
      <div className="space-y-4">
        {status}
        <div className="glass-strong mx-auto max-w-md rounded-3xl p-5">
          <KitDetails kit={chosen} rarity={chosen.rarity} t={t} locale={locale} />
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-cyan-100" data-testid="versus-pick-locked">
            <Loader2 className="h-4 w-4 animate-spin" /> {t.youPicked}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      {status}
      <p className="text-sm text-zinc-400">{t.pickHint}</p>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="input w-full pl-9" data-testid="versus-search" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!anime} onClick={() => setAnime(null)}>
              {t.all}
            </Chip>
            {ENABLED_ANIME.map((a) => (
              <Chip key={a.id} active={anime === a.id} color={a.color} onClick={() => setAnime(anime === a.id ? null : a.id)}>
                {a.shortName}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["TANK", "BLITZ", "POWER", "TACTIC"] as const).map((a) => (
              <Chip key={a} active={arch === a} color={ARCH_COLOR[a]} onClick={() => setArch(arch === a ? null : a)}>
                {t.archetypes[a]}
              </Chip>
            ))}
            <span className="ml-auto self-center text-xs text-zinc-500">{t.rosterCount(list.length)}</span>
          </div>
          {list.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">{t.noResults}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {list.map((c) => {
                const active = selected === c.characterId;
                return (
                  <button
                    key={c.characterId}
                    type="button"
                    onClick={() => setSelected(c.characterId)}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border bg-black/30 text-left transition",
                      active ? "border-cyan-300 ring-2 ring-cyan-300/60" : "border-white/10 hover:border-white/30",
                    )}
                    data-testid="versus-roster-item"
                    data-character={c.characterId}
                  >
                    <div className="aspect-[3/4] w-full">
                      <CharacterArt name={c.name} animeId={c.animeId} imageUrl={c.imageUrl} />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-1.5 pt-6">
                      <div className="truncate text-[11px] font-semibold text-white sm:text-xs">{c.name}</div>
                      <div className="text-[10px] font-bold" style={{ color: ARCH_COLOR[c.archetype] }}>
                        {t.archetypes[c.archetype]}
                      </div>
                    </div>
                    <span className="absolute left-1 top-1 h-2 w-2 rounded-full" style={{ background: RARITY_INFO[c.rarity as Rarity]?.color }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="order-first lg:order-none">
          <div className="glass-strong rounded-3xl p-4 lg:sticky lg:top-20">
            {chosen ? (
              <>
                <KitDetails kit={chosen} rarity={chosen.rarity} t={t} locale={locale} />
                <button type="button" className="btn btn-primary mt-4 hidden w-full lg:flex" disabled={pending} onClick={() => onPick(chosen.characterId)} data-testid="versus-confirm-pick">
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t.confirmPick}
                </button>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-zinc-400">{t.pickHint}</p>
            )}
          </div>
        </aside>
      </div>

      {chosen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/85 p-3 backdrop-blur lg:hidden">
          <button type="button" className="btn btn-primary w-full" disabled={pending} onClick={() => onPick(chosen.characterId)} data-testid="versus-confirm-pick-mobile">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t.confirmPick} · {chosen.name}
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition", active ? "text-white" : "border-white/10 bg-white/5 text-zinc-300 hover:text-white")}
      style={active ? { borderColor: color ?? "#a855f7", background: `${color ?? "#a855f7"}33` } : undefined}
    >
      {children}
    </button>
  );
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-zinc-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
      <span className="w-8 text-right font-display font-bold tabular-nums text-white">{value}</span>
    </div>
  );
}

function ArchetypeChip({ archetype, t }: { archetype: Archetype; t: VersusTexts }) {
  const c = ARCH_COLOR[archetype];
  return (
    <span className="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ color: c, borderColor: `${c}66`, background: `${c}1a` }}>
      {t.archetypes[archetype]}
    </span>
  );
}

function KitDetails({ kit, rarity, t, locale }: { kit: FighterKit; rarity?: string; t: VersusTexts; locale: Locale }) {
  const color = ARCH_COLOR[kit.archetype];
  return (
    <div data-testid="versus-kit">
      <div className="flex gap-3">
        <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10">
          <CharacterArt name={kit.name} animeId={kit.animeId} imageUrl={kit.imageUrl} />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-zinc-500">{getAnime(kit.animeId)?.name}</div>
          <div className="font-display text-xl font-bold leading-tight text-white">{kit.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <ArchetypeChip archetype={kit.archetype} t={t} />
            {rarity && (
              <span className="text-[11px] font-bold" style={{ color: RARITY_INFO[rarity as Rarity]?.color }}>
                {RARITY_INFO[rarity as Rarity]?.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-400">{t.archetypeDesc[kit.archetype]}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <StatBar label={t.stats.hp} value={kit.maxHp} max={450} color="#34d399" />
        <StatBar label={t.stats.atk} value={kit.atk} max={70} color="#f87171" />
        <StatBar label={t.stats.def} value={kit.def} max={52} color="#60a5fa" />
        <StatBar label={t.stats.spd} value={kit.spd} max={10} color={color} />
      </div>
      <AbilityList kit={kit} t={t} locale={locale} />
    </div>
  );
}

function AbilityList({ kit, t, locale }: { kit: FighterKit; t: VersusTexts; locale: Locale }) {
  return (
    <ul className="mt-3 space-y-2">
      {kit.abilities.map((ab) => (
        <li key={ab.id} className="rounded-xl border border-white/10 bg-black/25 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-white">{abilityName(kit.characterId, ab, locale)}</span>
            {ab.ultimate && <span className="rounded bg-amber-400/20 px-1.5 text-[10px] font-bold uppercase text-amber-200">{t.ultimate}</span>}
          </div>
          <div className="mt-0.5 text-xs text-zinc-400">{abilityDescription(ab, locale)}</div>
          <div className="mt-1 flex gap-3 text-[11px] text-zinc-500">
            <span className="text-cyan-200">{t.cost(ab.cost)}</span>
            <span>{t.cooldown(ab.cooldown)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Battle ─────────────────────────────────────────────────────────────────

function BattleView({
  snap,
  meIdx,
  isPlayer,
  secondsLeft,
  t,
  locale,
  pending,
  onMove,
  onRematch,
  userId,
}: {
  snap: VersusSnapshot;
  meIdx: number;
  isPlayer: boolean;
  secondsLeft: number | null;
  t: VersusTexts;
  locale: Locale;
  pending: boolean;
  onMove: (m: Move) => void;
  onRematch: () => void;
  userId: string;
}) {
  const oppIdx = 1 - meIdx;
  const last = snap.log[snap.log.length - 1] ?? null;
  // Flash the newest turn for a moment when it arrives.
  const [flashTurn, setFlashTurn] = useState<number | null>(null);
  const seen = useRef(snap.log.length);
  useEffect(() => {
    if (snap.log.length > seen.current && last) {
      setFlashTurn(last.turn);
      const id = setTimeout(() => setFlashTurn(null), 2200);
      seen.current = snap.log.length;
      return () => clearTimeout(id);
    }
    seen.current = snap.log.length;
  }, [snap.log.length, last]);

  const finished = snap.phase === "FINISHED";
  const turnSeconds = secondsLeft === null ? null : Math.min(TURN_SECONDS, secondsLeft);

  return (
    <div className="space-y-4">
      {finished ? (
        <ResultBanner snap={snap} meIdx={meIdx} isPlayer={isPlayer} t={t} onRematch={onRematch} pending={pending} userId={userId} />
      ) : (
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5">
          <span className="font-display text-sm font-bold text-white" data-testid="versus-turn">
            {t.turn(snap.turn, MAX_TURNS)}
          </span>
          {turnSeconds !== null && (
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-white/10 sm:block">
                <div
                  className={cn("h-full rounded-full transition-all", turnSeconds <= 5 ? "bg-rose-400" : "bg-cyan-300")}
                  style={{ width: `${(turnSeconds / TURN_SECONDS) * 100}%` }}
                />
              </div>
              <span className={cn("font-display text-sm font-bold tabular-nums", turnSeconds <= 5 ? "text-rose-300" : "text-white")} data-testid="versus-timer">
                {t.timeLeft(turnSeconds)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="relative grid grid-cols-2 gap-2 sm:gap-4">
        <FighterCard seat={snap.seats[meIdx]} isMe={isPlayer} side={last && flashTurn === last.turn ? last.sides[meIdx] : null} flashKey={flashTurn} showReady={!finished} t={t} winner={finished && snap.result?.winner === meIdx} />
        <FighterCard seat={snap.seats[oppIdx]} isMe={false} side={last && flashTurn === last.turn ? last.sides[oppIdx] : null} flashKey={flashTurn} showReady={!finished} t={t} winner={finished && snap.result?.winner === oppIdx} />
        <div className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-2 py-1 font-display text-xs font-bold text-zinc-300 sm:top-14">
          {t.vs}
        </div>
      </div>

      {last && <LastTurn log={last} snap={snap} meIdx={meIdx} t={t} locale={locale} highlight={flashTurn === last.turn} />}

      {!finished && isPlayer && (
        <ActionBar snap={snap} meIdx={meIdx} t={t} locale={locale} pending={pending} onMove={onMove} />
      )}

      <TurnHistory snap={snap} meIdx={meIdx} t={t} locale={locale} />
    </div>
  );
}

function FighterCard({
  seat,
  isMe,
  side,
  flashKey,
  showReady,
  t,
  winner,
}: {
  seat: VersusSeatView;
  isMe: boolean;
  side: TurnSide | null;
  flashKey: number | null;
  showReady: boolean;
  t: VersusTexts;
  winner: boolean;
}) {
  const f = seat.fighter;
  if (!f) return <div className="glass rounded-2xl p-3" />;
  const kit = f.kit;
  const color = ARCH_COLOR[kit.archetype];
  const hpPct = (f.hp / kit.maxHp) * 100;
  const healed = side?.events.find((e) => e.kind === "healed")?.amount ?? 0;
  return (
    <div
      className={cn("glass relative overflow-hidden rounded-2xl p-2.5 sm:p-4", winner && "ring-2 ring-amber-300/70", f.hp <= 0 && "opacity-70")}
      style={{ borderColor: `${color}55` }}
      data-testid={isMe ? "versus-fighter-me" : "versus-fighter-opp"}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl" style={{ background: `${color}33` }} />
      <div className="relative flex flex-col gap-2 sm:flex-row sm:gap-3">
        <div className="relative mx-auto h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 sm:mx-0 sm:h-32 sm:w-24">
          <CharacterArt name={kit.name} animeId={kit.animeId} imageUrl={kit.imageUrl} />
          {side && flashKey !== null && side.damageTaken > 0 && (
            <span key={`d${flashKey}`} className="absolute inset-x-0 top-1/3 animate-slide-up text-center font-display text-2xl font-black text-rose-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              -{side.damageTaken}
            </span>
          )}
          {side && flashKey !== null && healed > 0 && (
            <span key={`h${flashKey}`} className="absolute inset-x-0 bottom-2 animate-slide-up text-center font-display text-lg font-black text-emerald-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              +{healed}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 sm:justify-start">
            <Avatar username={seat.username} style={seat.avatar.style} imageUrl={seat.avatar.imageUrl} size={16} />
            <span className="truncate">
              {seat.username}
              {isMe && ` · ${t.you}`}
            </span>
            {seat.rating !== null && <span className="hidden text-zinc-500 sm:inline">{seat.rating}</span>}
          </div>
          <div className="truncate font-display text-sm font-bold text-white sm:text-lg">{kit.name}</div>
          <ArchetypeChip archetype={kit.archetype} t={t} />
        </div>
      </div>

      <div className="relative mt-2.5">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-zinc-400">{t.stats.hp}</span>
          <span className="font-display font-bold tabular-nums text-white" data-testid="versus-hp">
            {f.hp}
            <span className="text-zinc-500"> / {kit.maxHp}</span>
          </span>
        </div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${hpPct}%`, background: hpPct > 50 ? "#34d399" : hpPct > 25 ? "#fbbf24" : "#f43f5e" }}
          />
        </div>
        {f.shield > 0 && (
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-sky-300" style={{ width: `${Math.min(100, (f.shield / kit.maxHp) * 100)}%` }} />
          </div>
        )}
      </div>

      <div className="relative mt-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-400">{t.stats.energy}</span>
          <span className="font-display font-bold tabular-nums text-cyan-200" data-testid="versus-energy">
            {f.energy}
          </span>
        </div>
        <div className="mt-1 grid grid-cols-10 gap-0.5">
          {Array.from({ length: MAX_ENERGY }, (_, i) => (
            <span key={i} className={cn("h-1.5 rounded-sm", i < f.energy ? "bg-cyan-300" : "bg-white/10")} />
          ))}
        </div>
      </div>

      <Statuses f={f} t={t} />

      {showReady && !isMe && (
        <div className={cn("relative mt-2 text-center text-[11px] font-semibold sm:text-left", seat.moveReady ? "text-emerald-300" : "text-zinc-500")} data-testid="versus-opp-ready">
          {seat.moveReady ? (
            <>
              <Check className="mr-1 inline h-3 w-3" />
              {t.moveChosen}
            </>
          ) : (
            t.opponentThinking
          )}
        </div>
      )}
    </div>
  );
}

function Statuses({ f, t }: { f: FighterState; t: VersusTexts }) {
  const items: { label: string; color: string }[] = [];
  if (f.shield > 0) items.push({ label: t.status.shield(f.shield), color: "#7dd3fc" });
  if (f.empowered > 0) items.push({ label: t.status.empowered, color: "#f87171" });
  if (f.counterReady) items.push({ label: t.status.counter, color: "#facc15" });
  if (f.stunned) items.push({ label: t.status.stunned, color: "#c084fc" });
  else if (f.stunImmune) items.push({ label: t.status.immune, color: "#a1a1aa" });
  if (items.length === 0) return null;
  return (
    <div className="relative mt-2 flex flex-wrap justify-center gap-1 sm:justify-start">
      {items.map((s) => (
        <span key={s.label} className="rounded-full border px-1.5 py-0.5 text-[10px] font-bold" style={{ color: s.color, borderColor: `${s.color}55`, background: `${s.color}14` }}>
          {s.label}
        </span>
      ))}
    </div>
  );
}

function sideSummary(side: TurnSide, kit: FighterKit, t: VersusTexts, locale: Locale): { move: string; detail: string } {
  const move = moveName(side.move, kit.characterId, kit.abilities, locale);
  const parts = side.events.map((e) => eventText(e, locale));
  if (side.damageDealt > 0) parts.unshift(t.damage(side.damageDealt));
  return { move, detail: parts.join(" · ") };
}

function LastTurn({ log, snap, meIdx, t, locale, highlight }: { log: TurnLog; snap: VersusSnapshot; meIdx: number; t: VersusTexts; locale: Locale; highlight: boolean }) {
  const order = [meIdx, 1 - meIdx];
  return (
    <section className={cn("glass rounded-2xl p-3 transition sm:p-4", highlight && "border-cyan-300/60 shadow-[0_0_30px_rgba(34,211,238,0.25)]")} data-testid="versus-last-turn">
      <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-500">
        {t.lastTurn} · {t.turn(log.turn, MAX_TURNS)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {order.map((i) => {
          const kit = snap.seats[i].fighter?.kit;
          if (!kit) return <div key={i} />;
          const s = sideSummary(log.sides[i], kit, t, locale);
          return (
            <div key={i} className="min-w-0">
              <div className={cn("font-display text-sm font-bold sm:text-base", log.sides[i].acted ? "text-white" : "text-zinc-500 line-through")}>{s.move}</div>
              {s.detail && <div className="mt-0.5 text-xs text-zinc-400">{s.detail}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionBar({ snap, meIdx, t, locale, pending, onMove }: { snap: VersusSnapshot; meIdx: number; t: VersusTexts; locale: Locale; pending: boolean; onMove: (m: Move) => void }) {
  const f = snap.seats[meIdx].fighter;
  if (!f) return null;
  const chosen = snap.myMove;
  const locked = !!chosen || pending;
  const same = (m: Move) => !!chosen && chosen.type === m.type && (m.type !== "ABILITY" || chosen.abilityId === m.abilityId);

  const basics: { move: Move; icon: typeof Swords; color: string }[] = [
    { move: { type: "ATTACK" }, icon: Swords, color: "#f87171" },
    { move: { type: "DEFEND" }, icon: Shield, color: "#60a5fa" },
    { move: { type: "FOCUS" }, icon: Zap, color: "#22d3ee" },
  ];

  return (
    <section className="glass-strong rounded-3xl p-3 sm:p-4" data-testid="versus-actions">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        {f.stunned ? (
          <span className="font-semibold text-purple-200">{t.stunnedNow}</span>
        ) : chosen ? (
          <span className="flex items-center gap-2 text-cyan-100" data-testid="versus-move-locked">
            <Loader2 className="h-4 w-4 animate-spin" /> {t.lockedMove(moveName(chosen, f.kit.characterId, f.kit.abilities, locale))} · {t.waitingShort}
          </span>
        ) : (
          <span className="font-display font-bold text-white">{t.chooseMove}</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {basics.map(({ move, icon: Icon, color }) => (
          <button
            key={move.type}
            type="button"
            disabled={locked || f.stunned}
            onClick={() => onMove(move)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-center transition disabled:cursor-not-allowed",
              same(move) ? "border-cyan-300 bg-cyan-400/15" : "border-white/10 bg-white/5 enabled:hover:border-white/30 enabled:hover:bg-white/10",
              locked && !same(move) && "opacity-50",
            )}
            data-testid={`versus-move-${move.type}`}
          >
            <Icon className="h-5 w-5" style={{ color }} />
            <span className="text-sm font-bold text-white">{t.moves[move.type]}</span>
            <span className="hidden text-[10px] leading-tight text-zinc-400 sm:block">{t.moveDesc[move.type]}</span>
          </button>
        ))}
        {f.kit.abilities.map((ab) => {
          const move: Move = { type: "ABILITY", abilityId: ab.id };
          const err = moveError(f, move);
          const cd = f.cooldowns[ab.id] ?? 0;
          const name = abilityName(f.kit.characterId, ab, locale);
          return (
            <button
              key={ab.id}
              type="button"
              disabled={locked || f.stunned || !!err}
              onClick={() => onMove(move)}
              title={abilityDescription(ab, locale)}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-center transition disabled:cursor-not-allowed",
                same(move)
                  ? "border-cyan-300 bg-cyan-400/15"
                  : ab.ultimate
                    ? "border-amber-300/40 bg-amber-400/10 enabled:hover:border-amber-300/80"
                    : "border-purple-300/30 bg-purple-500/10 enabled:hover:border-purple-300/70",
                (err || (locked && !same(move))) && "opacity-45",
              )}
              data-testid={`versus-move-${ab.id}`}
            >
              {ab.ultimate ? <Sparkles className="h-5 w-5 text-amber-300" /> : <Crosshair className="h-5 w-5 text-purple-300" />}
              <span className="line-clamp-2 text-xs font-bold leading-tight text-white sm:text-sm">{name}</span>
              <span className="text-[10px] text-zinc-400">{t.kindShort[ab.kind]}</span>
              <span className="text-[10px] font-semibold text-cyan-200">{err === "ON_COOLDOWN" ? t.onCooldown(cd) : t.cost(ab.cost)}</span>
            </button>
          );
        })}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-zinc-400 hover:text-white">{t.myTechniques}</summary>
        <AbilityList kit={f.kit} t={t} locale={locale} />
      </details>
      {snap.seats[1 - meIdx].fighter && (
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer text-xs text-zinc-400 hover:text-white">{t.opponentTechniques}</summary>
          <AbilityList kit={snap.seats[1 - meIdx].fighter!.kit} t={t} locale={locale} />
        </details>
      )}
    </section>
  );
}

function TurnHistory({ snap, meIdx, t, locale }: { snap: VersusSnapshot; meIdx: number; t: VersusTexts; locale: Locale }) {
  if (snap.log.length < 2) return null;
  const kits = [snap.seats[0].fighter?.kit, snap.seats[1].fighter?.kit];
  return (
    <details className="glass rounded-2xl p-3 sm:p-4" open={snap.phase === "FINISHED"}>
      <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-zinc-400">{t.log}</summary>
      <ol className="mt-2 space-y-1.5 text-xs">
        {[...snap.log].reverse().map((l) => (
          <li key={l.turn} className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 border-t border-white/5 pt-1.5">
            <span className="font-display font-bold text-zinc-500">#{l.turn}</span>
            {[meIdx, 1 - meIdx].map((i) => {
              const kit = kits[i];
              if (!kit) return <span key={i} />;
              const s = sideSummary(l.sides[i], kit, t, locale);
              return (
                <span key={i} className="min-w-0">
                  <span className={cn("font-semibold", l.sides[i].acted ? "text-zinc-100" : "text-zinc-500 line-through")}>{s.move}</span>
                  {s.detail && <span className="text-zinc-500"> · {s.detail}</span>}
                </span>
              );
            })}
          </li>
        ))}
      </ol>
    </details>
  );
}

// ─── Result ─────────────────────────────────────────────────────────────────

function ResultBanner({
  snap,
  meIdx,
  isPlayer,
  t,
  onRematch,
  pending,
  userId,
}: {
  snap: VersusSnapshot;
  meIdx: number;
  isPlayer: boolean;
  t: VersusTexts;
  onRematch: () => void;
  pending: boolean;
  userId: string;
}) {
  const r = snap.result;
  if (!r) return null;
  const outcome = r.winner === null ? "draw" : r.winner === meIdx ? "win" : "loss";
  const title = !isPlayer
    ? r.winner === null
      ? t.draw
      : `${snap.seats[r.winner].username} · ${t.victory}`
    : outcome === "win"
      ? t.victory
      : outcome === "loss"
        ? t.defeat
        : t.draw;
  const reason = r.reason === "forfeit" && isPlayer && outcome === "loss" ? t.youForfeited : t.reasons[r.reason];
  const delta = snap.ratingChange?.[meIdx] ?? null;
  const color = outcome === "win" ? "#fbbf24" : outcome === "loss" ? "#f43f5e" : "#a1a1aa";
  const opp = snap.seats[1 - meIdx];
  const iVoted = snap.rematchVotes.includes(userId);
  const oppVoted = !!opp.userId && snap.rematchVotes.includes(opp.userId);

  return (
    <section className="glass-strong relative overflow-hidden rounded-3xl p-5 text-center sm:p-6" style={{ borderColor: `${color}66` }} data-testid="versus-result" data-outcome={outcome}>
      <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full blur-3xl" style={{ background: `${color}33` }} />
      <Trophy className="relative mx-auto h-9 w-9" style={{ color }} />
      <h1 className="relative mt-2 font-display text-3xl font-black sm:text-4xl" style={{ color }}>
        {title}
      </h1>
      <p className="relative mt-1 text-sm text-zinc-300">{reason}</p>
      {delta !== null && (
        <p className="relative mt-2 font-display text-lg font-bold" data-testid="versus-rating-change">
          {t.ratingChange}:{" "}
          <span className={delta >= 0 ? "text-emerald-300" : "text-rose-300"}>
            {delta >= 0 ? "+" : ""}
            {delta}
          </span>
        </p>
      )}
      {isPlayer && (
        <div className="relative mt-4 flex flex-wrap justify-center gap-2">
          {snap.mode === "ranked" ? (
            <Link href="/versus?auto=ranked" className="btn btn-primary" data-testid="versus-play-again">
              {t.playAgain}
            </Link>
          ) : snap.mode === "bot" ? (
            <button type="button" className="btn btn-primary" disabled={pending} onClick={onRematch} data-testid="versus-play-again">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t.playAgain}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={pending || iVoted} onClick={onRematch} data-testid="versus-rematch">
              {iVoted ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {t.rematchWaiting}
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4" /> {t.rematch}
                </>
              )}
            </button>
          )}
          <Link href="/versus" className="btn btn-ghost">
            {t.backToHub}
          </Link>
        </div>
      )}
      {isPlayer && snap.mode === "friendly" && oppVoted && !iVoted && <p className="relative mt-2 text-sm text-amber-200">{t.opponentWantsRematch}</p>}
    </section>
  );
}

function ForfeitButton({ t, onConfirm, disabled }: { t: VersusTexts; onConfirm: () => void; disabled: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="btn btn-ghost ml-auto px-3 py-1.5 text-sm text-rose-200" onClick={() => setAsking(true)} disabled={disabled} data-testid="versus-forfeit">
        <Flag className="h-4 w-4" /> {t.forfeit}
      </button>
    );
  }
  return (
    <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100 sm:w-auto">
      <span>{t.forfeitConfirm}</span>
      <button
        type="button"
        className="btn px-3 py-1 text-xs"
        style={{ background: "#e11d48", color: "white" }}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        data-testid="versus-forfeit-confirm"
      >
        {t.forfeit}
      </button>
      <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setAsking(false)}>
        {t.cancel}
      </button>
    </div>
  );
}
