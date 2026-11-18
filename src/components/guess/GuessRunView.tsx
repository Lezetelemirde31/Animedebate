"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Clock, Flame, Lightbulb, Loader2, RotateCcw, Trophy, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { api, isNetworkFailure } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { getAnime } from "@/data/anime";
import { LAST_STAGE, ROUND_SECONDS } from "@/game/guess/rules";
import type { RunView } from "@/server/guess/solo";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { CharacterArt } from "@/components/character/CharacterArt";
import { ErrorState, FormError, Spinner } from "@/components/ui/primitives";
import { GuessPicture } from "./GuessPicture";
import { NameSearch, type NameOption } from "./NameSearch";
import { GUESS_TEXT, type GuessTexts } from "./texts";

type Action = { action: "sync" } | { action: "guess"; characterId: string } | { action: "hint" } | { action: "next" } | { action: "quit" };

export function GuessRunView({ id, names }: { id: string; names: NameOption[] }) {
  const { locale } = useLanguage();
  const t = GUESS_TEXT[locale];
  const router = useRouter();
  const [v, setV] = useState<RunView | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [askQuit, setAskQuit] = useState(false);
  const [restarting, setRestarting] = useState(false);
  // The last round's result is shown before the summary.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const offset = useRef(0);
  const [, setTick] = useState(0);

  const send = useCallback(
    async (a: Action) => {
      const res = await api<RunView>(`/api/guess/runs/${id}`, { body: a });
      if (res.ok) {
        offset.current = res.data.serverNow - Date.now();
        setV(res.data);
      }
      return res;
    },
    [id],
  );

  const act = useCallback(
    async (a: Action) => {
      setError(null);
      setPending(true);
      const res = await send(a);
      setPending(false);
      if (!res.ok && res.message) {
        setError(res.message);
        void send({ action: "sync" });
      } else if (!res.ok && isNetworkFailure(res)) {
        setError(t.connectionLost);
      }
    },
    [send, t.connectionLost],
  );

  useEffect(() => {
    void send({ action: "sync" }).then((res) => {
      if (!res.ok && !isNetworkFailure(res)) setFatal(res.message);
      else if (res.ok && res.data.finished) setSummaryOpen(true);
    });
  }, [send]);

  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(iv);
  }, []);

  // When the round's time runs out, ask the server (it decides the timeout).
  const endsAt = v?.round.result === null ? v.round.endsAt : null;
  useEffect(() => {
    if (!endsAt) return;
    const ms = endsAt - (Date.now() + offset.current) + 150;
    const timer = setTimeout(() => void send({ action: "sync" }), Math.max(0, ms));
    return () => clearTimeout(timer);
  }, [endsAt, send]);

  // Enter moves on to the next round once a round is decided.
  useEffect(() => {
    if (!v || v.round.result === null || summaryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.target instanceof HTMLInputElement) return;
      if (v.finished) setSummaryOpen(true);
      else void act({ action: "next" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [v, act, summaryOpen]);

  async function playAgain() {
    if (!v) return;
    setRestarting(true);
    const res = await api<{ id: string }>("/api/guess/runs", { body: { kind: "solo", mode: v.mode, difficulty: v.difficulty, animeId: v.animeId } });
    if (res.ok) router.push(`/guess/run/${res.data.id}`);
    else {
      setRestarting(false);
      setError(res.message || null);
    }
  }

  if (fatal) {
    return (
      <ErrorState
        title={fatal}
        action={
          <Link href="/guess" className="btn btn-primary">
            {t.backToHub}
          </Link>
        }
      />
    );
  }
  if (!v) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const r = v.round;
  const now = Date.now() + offset.current;
  const secondsLeft = r.result === null && r.endsAt ? Math.max(0, Math.ceil((r.endsAt - now) / 1000)) : null;
  const over = r.result !== null;

  if (v.finished && (summaryOpen || !over)) {
    return <Summary v={v} t={t} locale={locale} onPlayAgain={playAgain} restarting={restarting} error={error} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-10" data-testid="guess-run" data-round={r.number}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/guess" className="btn btn-ghost px-3 py-1.5 text-sm" aria-label={t.title}>
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{t.title}</span>
        </Link>
        <span className="rounded-full border border-lime-400/40 bg-lime-400/10 px-3 py-1 text-xs font-semibold text-lime-100">
          {v.kind === "daily" ? t.daily : `${t.modes[v.mode]} · ${t.difficulties[v.difficulty]}`}
        </span>
        {v.animeId && <span className="hidden text-xs text-zinc-400 sm:inline">{getAnime(v.animeId)?.name}</span>}
        <div className="ml-auto">
          {askQuit ? (
            <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              <span>{t.quitConfirm}</span>
              <button type="button" className="btn px-3 py-1 text-xs" style={{ background: "#e11d48", color: "white" }} onClick={() => void act({ action: "quit" }).then(() => setSummaryOpen(true))} data-testid="guess-quit-confirm">
                {t.yes}
              </button>
              <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setAskQuit(false)}>
                {t.no}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost px-3 py-1.5 text-sm text-zinc-300" onClick={() => setAskQuit(true)} data-testid="guess-quit">
              {t.quit}
            </button>
          )}
        </div>
      </div>

      <div className="glass grid grid-cols-3 gap-2 rounded-2xl px-4 py-2.5 text-center sm:flex sm:items-center sm:gap-6 sm:text-left">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">{t.round(r.number, v.total).split(" ")[0]}</div>
          <div className="font-display font-bold text-white" data-testid="guess-round">
            {r.number} / {v.total}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">{t.score}</div>
          <div className="font-display font-bold text-lime-200" data-testid="guess-score">
            {v.score}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">{t.streak}</div>
          <div className={cn("flex items-center justify-center gap-1 font-display font-bold sm:justify-start", v.streak > 1 ? "text-orange-300" : "text-white")}>
            <Flame className="h-4 w-4" /> {v.streak}
          </div>
        </div>
        {secondsLeft !== null && (
          <div className="col-span-3 flex items-center gap-2 sm:col-span-1 sm:ml-auto">
            <Clock className="h-4 w-4 text-zinc-400" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10 sm:w-40">
              <div className={cn("h-full rounded-full transition-all", secondsLeft <= 5 ? "bg-rose-400" : "bg-lime-300")} style={{ width: `${(secondsLeft / ROUND_SECONDS) * 100}%` }} />
            </div>
            <span className={cn("w-10 text-right font-display text-sm font-bold tabular-nums", secondsLeft <= 5 ? "text-rose-300" : "text-white")} data-testid="guess-timer">
              {t.timeLeft(secondsLeft)}
            </span>
          </div>
        )}
      </div>

      <FormError message={error} />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div>
          <GuessPicture
            key={r.number}
            src={r.image}
            mode={r.mode}
            stage={r.stage}
            label={`${t.modes[r.mode]} · ${t.stage(r.stage)}`}
            revealUrl={over ? (r.answer?.imageUrl ?? null) : null}
            revealName={r.answer?.name}
          />
        </div>

        <div className="space-y-3">
          {over ? (
            <RoundResult v={v} t={t} pending={pending} onNext={() => (v.finished ? setSummaryOpen(true) : void act({ action: "next" }))} />
          ) : (
            <section className="glass-strong space-y-3 rounded-3xl p-4">
              <NameSearch
                options={names}
                exclude={r.guesses.map((g) => g.id)}
                disabled={pending}
                placeholder={t.guessPlaceholder}
                noMatch={t.noMatch}
                onPick={(characterId) => void act({ action: "guess", characterId })}
              />
              <Hints hints={r.hints} t={t} />
              {r.guesses.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="guess-tried">
                  <span className="text-zinc-500">{t.tried}:</span>
                  {r.guesses.map((g) => (
                    <span key={g.id} className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-rose-200 line-through">
                      {g.name}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="btn btn-ghost w-full"
                disabled={pending || r.stage >= LAST_STAGE}
                onClick={() => void act({ action: "hint" })}
                data-testid="guess-hint"
              >
                <Lightbulb className="h-4 w-4 text-amber-300" />
                {r.stage >= LAST_STAGE ? t.noMoreHints : t.hint}
                {r.stage < LAST_STAGE && <span className="text-[11px] text-zinc-500">· {t.hintCost}</span>}
              </button>
            </section>
          )}
          <History v={v} t={t} />
        </div>
      </div>
    </div>
  );
}

function Hints({ hints, t }: { hints: { animeId: string | null; initials: string | null }; t: GuessTexts }) {
  const anime = hints.animeId ? getAnime(hints.animeId) : null;
  return (
    <div className="grid grid-cols-2 gap-2 text-sm" data-testid="guess-hints">
      <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500">{t.animeHint}</div>
        <div className="font-semibold" style={{ color: anime?.color ?? "#71717a" }}>
          {anime?.name ?? "?"}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500">{t.initialsHint}</div>
        <div className="font-display font-bold tracking-widest text-white">{hints.initials ?? "?"}</div>
      </div>
    </div>
  );
}

function RoundResult({ v, t, pending, onNext }: { v: RunView; t: GuessTexts; pending: boolean; onNext: () => void }) {
  const r = v.round;
  const good = r.result === "correct";
  const label = good ? t.correct : r.result === "timeout" ? t.timeout : r.result === "skipped" ? t.skipped : t.wrong;
  const last = r.number === v.total;
  return (
    <section
      className={cn("glass-strong animate-slide-up rounded-3xl p-5 text-center", good ? "border-lime-300/50" : "border-rose-400/40")}
      data-testid="guess-round-result"
      data-result={r.result}
    >
      <div className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-full", good ? "bg-lime-400/20 text-lime-200" : "bg-rose-500/20 text-rose-200")}>
        {good ? <Check className="h-6 w-6" /> : <X className="h-6 w-6" />}
      </div>
      <h2 className={cn("mt-2 font-display text-2xl font-black", good ? "text-lime-200" : "text-rose-200")}>{label}</h2>
      {r.answer && (
        <p className="mt-1 text-sm text-zinc-300">
          {t.answerWas}: <span className="font-bold text-white" data-testid="guess-answer">{r.answer.name}</span>
          <span className="text-zinc-500"> · {getAnime(r.answer.animeId)?.name}</span>
        </p>
      )}
      {good && <p className="mt-2 font-display text-xl font-bold text-lime-200">{t.pointsEarned(r.points)}</p>}
      <button type="button" className="btn btn-primary mt-4 w-full" disabled={pending} onClick={onNext} data-testid="guess-next">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {last ? t.seeResults : t.nextRound}
      </button>
    </section>
  );
}

function History({ v, t }: { v: RunView; t: GuessTexts }) {
  if (v.history.length === 0) return null;
  return (
    <section className="glass rounded-2xl p-3">
      <ol className="flex flex-wrap gap-1.5">
        {v.history.map((h) => (
          <li
            key={h.number}
            title={h.answer?.name}
            className={cn(
              "flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-[11px] font-bold",
              h.result === "correct" ? "bg-lime-400/20 text-lime-200" : "bg-rose-500/15 text-rose-200",
            )}
          >
            {h.result === "correct" ? `+${h.points}` : "✕"}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Summary({
  v,
  t,
  locale,
  onPlayAgain,
  restarting,
  error,
}: {
  v: RunView;
  t: GuessTexts;
  locale: Locale;
  onPlayAgain: () => void;
  restarting: boolean;
  error: string | null;
}) {
  void locale;
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10" data-testid="guess-summary">
      <section className="glass-strong relative overflow-hidden rounded-3xl p-6 text-center">
        <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full bg-lime-400/20 blur-3xl" />
        <Trophy className="relative mx-auto h-9 w-9 text-lime-300" />
        <h1 className="relative mt-2 font-display text-3xl font-black text-white">{v.kind === "daily" ? t.dailyFinished : t.finished}</h1>
        <div className="relative mt-4 text-[11px] uppercase tracking-widest text-zinc-500">{t.finalScore}</div>
        <div className="relative font-display text-5xl font-black text-lime-200" data-testid="guess-final-score">
          {v.score}
        </div>
        <p className="relative mt-2 text-sm text-zinc-300">
          {t.correctCount(v.correct, v.total)} · {t.bestStreakLine(v.bestStreak)}
        </p>
        {v.kind === "daily" && <p className="relative mt-1 text-sm text-zinc-400">{t.comeBackTomorrow}</p>}
        <FormError message={error} />
        <div className="relative mt-5 flex flex-wrap justify-center gap-2">
          {v.kind === "solo" && (
            <button type="button" className="btn btn-primary" onClick={onPlayAgain} disabled={restarting} data-testid="guess-play-again">
              {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} {t.playAgain}
            </button>
          )}
          <Link href="/guess" className="btn btn-ghost">
            {t.backToHub}
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {v.history.map((h) => (
          <div key={h.number} className={cn("glass overflow-hidden rounded-2xl", h.result === "correct" ? "border-lime-300/40" : "border-rose-400/30")}>
            <div className="aspect-[3/4]">{h.answer && <CharacterArt name={h.answer.name} animeId={h.answer.animeId} imageUrl={h.answer.imageUrl} />}</div>
            <div className="p-2">
              <div className="truncate text-xs font-semibold text-white">{h.answer?.name}</div>
              <div className={cn("text-[11px] font-bold", h.result === "correct" ? "text-lime-200" : "text-rose-200")}>
                {h.result === "correct" ? t.pointsEarned(h.points) : h.result === "timeout" ? t.timeout : h.result === "skipped" ? t.skipped : t.wrong}
                <span className="ml-1 font-normal text-zinc-500">· {t.modes[h.mode]}</span>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
