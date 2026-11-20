"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Crown, Flame, Loader2, Play, Swords, Users, X } from "lucide-react";
import { api } from "@/lib/client-api";
import type { Ack } from "@/game/types";
import { cn } from "@/lib/utils";
import { ENABLED_ANIME } from "@/data/anime";
import { msUntilNextDay } from "@/game/guess/rules";
import { QUIZ_DIFFICULTIES, type QuizDifficulty } from "@/game/quiz/rules";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { FormError } from "@/components/ui/primitives";
import { QUIZ_TEXT } from "./texts";

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
  questions: number;
}

export function QuizHub({
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
  const t = QUIZ_TEXT[locale];
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(activeRoom);
  const [busy, setBusy] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("MIXED");
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
        const res: Ack<QueueStatus> = await api<QueueStatus>("/api/quiz/queue", { body: { join } });
        if (!searchingRef.current) break;
        if (!res.ok) {
          if (res.message) {
            fail(res);
            break;
          }
        } else {
          join = !res.data.inQueue && !res.data.matchedCode;
          if (res.data.matchedCode) {
            router.push(`/quiz/room/${res.data.matchedCode}`);
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
    await api("/api/quiz/queue", { method: "DELETE" });
  }

  useEffect(() => {
    const onHide = () => {
      if (searchingRef.current) navigator.sendBeacon?.("/api/quiz/queue/leave");
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (searchingRef.current) {
        searchingRef.current = false;
        void api("/api/quiz/queue", { method: "DELETE" });
      }
    };
  }, []);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoRanked && signedIn && !activeRoom && !autoStarted.current) {
      autoStarted.current = true;
      router.replace("/quiz");
      void startSearch();
    }
  }, [autoRanked, signedIn, activeRoom, router, startSearch]);

  const login = (
    <Link href="/login?next=/quiz" className="btn btn-primary w-full">
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
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl border-amber-400/40 px-4 py-3 text-sm">
          <Users className="h-4 w-4 text-amber-300" />
          <span className="text-zinc-200">{t.activeRoom(room)}</span>
          <Link href={`/quiz/room/${room}`} className="btn btn-primary ml-auto px-4 py-1.5 text-sm">
            {t.backToRoom}
          </Link>
        </div>
      )}
      <FormError message={error} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Daily */}
        <section className="glass-strong relative flex flex-col overflow-hidden rounded-3xl p-5" style={{ borderColor: "#f59e0b55" }} data-testid="quiz-daily-card">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <CalendarDays className="h-7 w-7 text-amber-300" />
            {dailyStreak > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-bold text-orange-200" data-testid="quiz-daily-streak">
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
                <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" data-testid="quiz-daily-done">
                  {t.dailyDone(daily.score, daily.correct, daily.questions)}
                </p>
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                  <span>{t.dailyNext(h, m)}</span>
                  <Link href={`/quiz/run/${daily.id}`} className="text-amber-200 hover:text-white">
                    {t.dailyResult}
                  </Link>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={locked}
                onClick={() => void post("daily", "/api/quiz/runs", { kind: "daily" }, (d) => `/quiz/run/${d.id}`)}
                data-testid="quiz-daily-start"
              >
                {busy === "daily" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {daily ? t.dailyContinue : t.dailyPlay}
              </button>
            )}
          </div>
        </section>

        {/* Solo */}
        <section className="glass relative flex flex-col rounded-3xl p-5" data-testid="quiz-solo-card">
          <h2 className="font-display text-xl font-bold text-white">{t.solo}</h2>
          <p className="mt-1 text-sm text-zinc-400">{t.soloDesc}</p>
          {signedIn && (
            <div className="mt-3 space-y-2.5">
              <Row>
                {QUIZ_DIFFICULTIES.map((d) => (
                  <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)} testId={`quiz-diff-${d}`}>
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
                  onClick={() => void post("solo", "/api/quiz/runs", { kind: "solo", difficulty, animeId: anime }, (d) => `/quiz/run/${d.id}`)}
                  data-testid="quiz-solo-start"
                >
                  {busy === "solo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {t.soloStart}
                </button>
                {openRun && (
                  <Link href={`/quiz/run/${openRun}`} className="block text-center text-xs text-amber-200 hover:text-white">
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
                  onClick={() => void post("room", "/api/quiz/rooms", { settings: {} }, (d) => `/quiz/room/${d.code}`)}
                  data-testid="quiz-create-room"
                >
                  {busy === "room" && <Loader2 className="h-4 w-4 animate-spin" />} {t.createRoom}
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
                    if (c.length >= 4) router.push(`/quiz/room/${c}`);
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
        <section className="glass relative flex flex-col rounded-3xl p-5" style={{ borderColor: "#f59e0b33" }}>
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
                <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-sm font-semibold text-amber-100" data-testid="quiz-searching">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t.searching} <span className="tabular-nums text-amber-300">{t.timeLeft(elapsed)}</span>
                </div>
                <button type="button" className="btn btn-ghost px-3" onClick={() => void stopSearch()} aria-label={t.cancel}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-primary w-full" disabled={locked || !!room} onClick={() => void startSearch()} data-testid="quiz-find">
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
      className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition", active ? "border-amber-300 bg-amber-400/20 text-white" : "border-white/10 bg-white/5 text-zinc-300 hover:text-white")}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
