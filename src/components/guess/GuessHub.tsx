"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Crown, Flame, Loader2, Play, Swords, Users, X } from "lucide-react";
import { api } from "@/lib/client-api";
import type { Ack } from "@/game/types";
import { cn } from "@/lib/utils";
import { ENABLED_ANIME } from "@/data/anime";
import { DIFFICULTIES, RUN_MODES, msUntilNextDay, type Difficulty, type RunMode } from "@/game/guess/rules";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { FormError } from "@/components/ui/primitives";
import { GUESS_TEXT } from "./texts";

interface QueueStatus {
  inQueue: boolean;
  since: number | null;
  matchedCode: string | null;
  rating: number;
}

export interface HubDaily {
  id: string;
  finished: boolean;
  score: number;
  correct: number;
  rounds: number;
}

export function GuessHub({
  signedIn,
  daily,
  dailyStreak,
  openRun,
  activeRoom,
  autoRanked,
  rating,
}: {
  signedIn: boolean;
  daily: HubDaily | null;
  dailyStreak: number;
  openRun: string | null;
  activeRoom: string | null;
  autoRanked: boolean;
  rating: React.ReactNode;
}) {
  const { locale } = useLanguage();
  const t = GUESS_TEXT[locale];
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(activeRoom);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<RunMode>("MIXED");
  const [difficulty, setDifficulty] = useState<Difficulty>("NORMAL");
  const [anime, setAnime] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const searchingRef = useRef(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  const fail = useCallback((res: { message: string; data?: { code?: string } }) => {
    setError(res.message || null);
    if (res.data?.code) setRoom(res.data.code);
  }, []);

  type Created = { id?: string; code?: string };
  async function post(key: string, path: string, body: unknown, go: (d: Created) => string) {
    setError(null);
    setBusy(key);
    const res = await api<Created>(path, { body });
    if (res.ok) {
      router.push(go(res.data));
      return;
    }
    setBusy(null);
    fail(res);
  }

  const startSearch = useCallback(async () => {
    if (searchingRef.current) return;
    setError(null);
    searchingRef.current = true;
    setSearching(true);
    const started = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    let join = true;
    try {
      while (searchingRef.current) {
        const res: Ack<QueueStatus> = await api<QueueStatus>("/api/guess/queue", { body: { join } });
        if (!searchingRef.current) break;
        if (!res.ok) {
          if (res.message) {
            fail(res);
            break;
          }
        } else {
          join = !res.data.inQueue && !res.data.matchedCode;
          if (res.data.matchedCode) {
            router.push(`/guess/room/${res.data.matchedCode}`);
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    } finally {
      clearInterval(iv);
      searchingRef.current = false;
      setSearching(false);
    }
  }, [fail, router]);

  async function stopSearch() {
    searchingRef.current = false;
    setSearching(false);
    await api("/api/guess/queue", { method: "DELETE" });
  }

  useEffect(() => {
    const onHide = () => {
      if (searchingRef.current) navigator.sendBeacon?.("/api/guess/queue/leave");
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (searchingRef.current) {
        searchingRef.current = false;
        void api("/api/guess/queue", { method: "DELETE" });
      }
    };
  }, []);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoRanked && signedIn && !activeRoom && !autoStarted.current) {
      autoStarted.current = true;
      router.replace("/guess");
      void startSearch();
    }
  }, [autoRanked, signedIn, activeRoom, router, startSearch]);

  const login = (
    <Link href="/login?next=/guess" className="btn btn-primary w-full">
      {t.loginToPlay}
    </Link>
  );
  const locked = searching || busy !== null;
  const left = msUntilNextDay();
  const h = Math.floor(left / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);

  return (
    <div className="space-y-4">
      {room && (
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl border-lime-400/40 px-4 py-3 text-sm">
          <Users className="h-4 w-4 text-lime-300" />
          <span className="text-zinc-200">{t.activeRoom(room)}</span>
          <Link href={`/guess/room/${room}`} className="btn btn-primary ml-auto px-4 py-1.5 text-sm">
            {t.backToRoom}
          </Link>
        </div>
      )}
      <FormError message={error} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Daily */}
        <section className="glass-strong relative flex flex-col overflow-hidden rounded-3xl p-5" style={{ borderColor: "#a3e63555" }} data-testid="guess-daily-card">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-lime-400/20 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <CalendarDays className="h-7 w-7 text-lime-300" />
            {dailyStreak > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-bold text-orange-200" data-testid="guess-daily-streak">
                <Flame className="h-3.5 w-3.5" /> {t.dailyStreak(dailyStreak)}
              </span>
            )}
          </div>
          <h2 className="relative mt-2 font-display text-xl font-bold text-white">{t.daily}</h2>
          <p className="relative mt-1 text-sm text-zinc-400">{t.dailyDesc}</p>
          <div className="relative mt-auto pt-4">
            {!signedIn ? (
              login
            ) : daily?.finished ? (
              <div className="space-y-2">
                <p className="rounded-xl border border-lime-400/30 bg-lime-400/10 px-3 py-2 text-sm text-lime-100" data-testid="guess-daily-done">
                  {t.dailyDone(daily.score, daily.correct, daily.rounds)}
                </p>
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                  <span>{t.dailyNext(h, m)}</span>
                  <Link href={`/guess/run/${daily.id}`} className="text-lime-200 hover:text-white">
                    {t.dailyResult}
                  </Link>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={locked}
                onClick={() => void post("daily", "/api/guess/runs", { kind: "daily" }, (d) => `/guess/run/${d.id}`)}
                data-testid="guess-daily-start"
              >
                {busy === "daily" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {daily ? t.dailyContinue : t.dailyPlay}
              </button>
            )}
          </div>
        </section>

        {/* Solo */}
        <section className="glass relative flex flex-col rounded-3xl p-5" data-testid="guess-solo-card">
          <h2 className="font-display text-xl font-bold text-white">{t.solo}</h2>
          <p className="mt-1 text-sm text-zinc-400">{t.soloDesc}</p>
          {signedIn && (
            <div className="mt-3 space-y-2.5">
              <Row>
                {RUN_MODES.map((x) => (
                  <Chip key={x} active={mode === x} onClick={() => setMode(x)} testId={`guess-mode-${x}`}>
                    {t.modes[x]}
                  </Chip>
                ))}
              </Row>
              <p className="text-xs text-zinc-500">{t.modeDesc[mode]}</p>
              <Row>
                {DIFFICULTIES.map((d) => (
                  <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)} testId={`guess-diff-${d}`}>
                    {t.difficulties[d]}
                  </Chip>
                ))}
              </Row>
              <p className="text-xs text-zinc-500">{t.difficultyDesc[difficulty]}</p>
              <Row>
                <Chip active={!anime} onClick={() => setAnime(null)}>
                  {t.allAnime}
                </Chip>
                {ENABLED_ANIME.map((a) => (
                  <Chip key={a.id} active={anime === a.id} onClick={() => setAnime(a.id)}>
                    {a.shortName}
                  </Chip>
                ))}
              </Row>
            </div>
          )}
          <div className="mt-auto space-y-2 pt-4">
            {!signedIn ? (
              login
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  disabled={locked}
                  onClick={() => void post("solo", "/api/guess/runs", { kind: "solo", mode, difficulty, animeId: anime }, (d) => `/guess/run/${d.id}`)}
                  data-testid="guess-solo-start"
                >
                  {busy === "solo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {t.soloStart}
                </button>
                {openRun && (
                  <Link href={`/guess/run/${openRun}`} className="block text-center text-xs text-lime-200 hover:text-white">
                    {t.soloContinue}
                  </Link>
                )}
              </>
            )}
          </div>
        </section>

        {/* Race room */}
        <section className="glass relative flex flex-col rounded-3xl p-5">
          <Users className="h-7 w-7 text-purple-300" />
          <h2 className="mt-2 font-display text-xl font-bold text-white">{t.race}</h2>
          <p className="mt-1 text-sm text-zinc-400">{t.raceDesc}</p>
          <div className="mt-auto space-y-2 pt-4">
            {!signedIn ? (
              login
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  disabled={locked || !!room}
                  onClick={() => void post("room", "/api/guess/rooms", { settings: {} }, (d) => `/guess/room/${d.code}`)}
                  data-testid="guess-create-room"
                >
                  {busy === "room" && <Loader2 className="h-4 w-4 animate-spin" />} {t.createRoom}
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
                    if (c.length >= 4) router.push(`/guess/room/${c}`);
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder={t.joinCode}
                    maxLength={8}
                    aria-label={t.joinCode}
                    className="input min-w-0 flex-1 font-display uppercase tracking-widest"
                  />
                  <button type="submit" className="btn btn-ghost" disabled={locked || code.trim().length < 4}>
                    {t.join}
                  </button>
                </form>
              </>
            )}
          </div>
        </section>

        {/* Ranked */}
        <section className="glass relative flex flex-col rounded-3xl p-5" style={{ borderColor: "#a3e63533" }}>
          <Crown className="h-7 w-7 text-amber-300" />
          <h2 className="mt-2 font-display text-xl font-bold text-white">{t.ranked}</h2>
          <p className="mt-1 text-sm text-zinc-400">{t.rankedDesc}</p>
          {signedIn && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-widest text-zinc-500">{t.yourRating}</div>
              <div className="mt-1">{rating}</div>
            </div>
          )}
          <div className="mt-auto pt-4">
            {!signedIn ? (
              login
            ) : searching ? (
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-lime-400/40 bg-lime-400/10 px-3 py-2.5 text-sm font-semibold text-lime-100" data-testid="guess-searching">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t.searching} <span className="tabular-nums text-lime-300">{t.timeLeft(elapsed)}</span>
                </div>
                <button type="button" className="btn btn-ghost px-3" onClick={() => void stopSearch()} aria-label={t.cancel}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-primary w-full" disabled={locked || !!room} onClick={() => void startSearch()} data-testid="guess-find">
                <Swords className="h-4 w-4" /> {t.findMatch}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Chip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition", active ? "border-lime-300 bg-lime-400/20 text-white" : "border-white/10 bg-white/5 text-zinc-300 hover:text-white")}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
