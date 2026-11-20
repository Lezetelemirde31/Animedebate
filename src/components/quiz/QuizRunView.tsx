"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Clock, Flame, Loader2, RotateCcw, SplitSquareHorizontal, Timer, Trophy, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { api, isNetworkFailure } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { getAnime } from "@/data/anime";
import type { QuizRunView as RunView } from "@/server/quiz/solo";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { ErrorState, FormError, Spinner } from "@/components/ui/primitives";
import { OptionButton, type OptionState } from "./OptionButton";
import { QUIZ_TEXT, type QuizTexts } from "./texts";

type Action =
  | { action: "sync" }
  | { action: "answer"; choice: number; question: number }
  | { action: "joker"; kind: "fifty" | "time" }
  | { action: "next" }
  | { action: "quit" };

export function QuizRunView({ id }: { id: string }) {
  const { locale } = useLanguage();
  const t = QUIZ_TEXT[locale];
  const router = useRouter();
  const [v, setV] = useState<RunView | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [askQuit, setAskQuit] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const offset = useRef(0);
  const [, setTick] = useState(0);

  const send = useCallback(
    async (a: Action) => {
      const res = await api<RunView>(`/api/quiz/runs/${id}`, { body: a });
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
      } else if (!res.ok && isNetworkFailure(res)) setError(t.connectionLost);
      return res;
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
    const iv = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(iv);
  }, []);

  // The server decides a timeout; ask it when the clock runs out.
  const endsAt = v && v.question.result === null ? v.question.endsAt : null;
  useEffect(() => {
    if (!endsAt) return;
    const timer = setTimeout(() => void send({ action: "sync" }), Math.max(0, endsAt - (Date.now() + offset.current) + 150));
    return () => clearTimeout(timer);
  }, [endsAt, send]);

  // Keyboard: 1–4 / A–D answer, Enter moves on.
  useEffect(() => {
    if (!v || summaryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const q = v.question;
      if (q.result === null && !pending) {
        const i = ["1", "2", "3", "4"].indexOf(e.key) >= 0 ? ["1", "2", "3", "4"].indexOf(e.key) : ["a", "b", "c", "d"].indexOf(e.key.toLowerCase());
        if (i >= 0 && !q.hidden.includes(i)) void act({ action: "answer", choice: i, question: v.index });
      } else if (q.result !== null && e.key === "Enter") {
        if (v.finished) setSummaryOpen(true);
        else void act({ action: "next" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [v, act, pending, summaryOpen]);

  async function playAgain() {
    if (!v) return;
    setRestarting(true);
    const res = await api<{ id: string }>("/api/quiz/runs", { body: { kind: "solo", difficulty: v.difficulty, animeId: v.animeId } });
    if (res.ok) router.push(`/quiz/run/${res.data.id}`);
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
          <Link href="/quiz" className="btn btn-primary">
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
  if (v.finished && (summaryOpen || v.question.result === null)) {
    return <Summary v={v} t={t} locale={locale} onPlayAgain={playAgain} restarting={restarting} error={error} />;
  }

  const q = v.question;
  const now = Date.now() + offset.current;
  const over = q.result !== null;
  const limit = q.endsAt && q.startedAt ? (q.endsAt - q.startedAt) / 1000 : 15;
  const secondsLeft = !over && q.endsAt ? Math.max(0, Math.ceil((q.endsAt - now) / 1000)) : null;
  const anime = getAnime(q.animeId);
  const options = q.options[locale];
  const stateOf = (i: number): OptionState => {
    if (q.hidden.includes(i)) return "hidden";
    if (!over) return pending && q.choice === i ? "chosen" : "idle";
    if (i === q.correct) return "correct";
    if (i === q.choice) return "wrong";
    return "faded";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10" data-testid="quiz-run" data-question={q.number}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/quiz" className="btn btn-ghost px-3 py-1.5 text-sm" aria-label={t.title}>
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{t.title}</span>
        </Link>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">
          {v.kind === "daily" ? t.daily : t.difficulties[v.difficulty]}
        </span>
        <div className="ml-auto">
          {askQuit ? (
            <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              <span>{t.quitConfirm}</span>
              <button
                type="button"
                className="btn px-3 py-1 text-xs"
                style={{ background: "#e11d48", color: "white" }}
                onClick={() => void act({ action: "quit" }).then(() => setSummaryOpen(true))}
                data-testid="quiz-quit-confirm"
              >
                {t.yes}
              </button>
              <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setAskQuit(false)}>
                {t.no}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost px-3 py-1.5 text-sm text-zinc-300" onClick={() => setAskQuit(true)} data-testid="quiz-quit">
              {t.quit}
            </button>
          )}
        </div>
      </div>

      <div className="glass grid grid-cols-3 gap-2 rounded-2xl px-4 py-2.5 text-center sm:flex sm:items-center sm:gap-6 sm:text-left">
        <Stat label={t.question(q.number, v.total).split(" ")[0]} value={`${q.number} / ${v.total}`} testId="quiz-progress" />
        <Stat label={t.score} value={v.score} accent="text-amber-200" testId="quiz-score" />
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
              <div className={cn("h-full rounded-full transition-all", secondsLeft <= 5 ? "bg-rose-400" : "bg-amber-300")} style={{ width: `${Math.min(100, (secondsLeft / limit) * 100)}%` }} />
            </div>
            <span className={cn("w-10 text-right font-display text-sm font-bold tabular-nums", secondsLeft <= 5 ? "text-rose-300" : "text-white")} data-testid="quiz-timer">
              {t.timeLeft(secondsLeft)}
            </span>
          </div>
        )}
      </div>

      <FormError message={error} />

      <section className="glass-strong rounded-3xl p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full px-2 py-0.5 font-semibold" style={{ color: anime?.color, background: `${anime?.color ?? "#fff"}1a` }}>
            {anime?.name}
          </span>
          <span className="text-zinc-500">{t.categories[q.category as keyof typeof t.categories] ?? ""}</span>
        </div>
        <h1 className="font-display text-xl font-bold leading-snug text-white sm:text-2xl" data-testid="quiz-question">
          {q.q[locale]}
        </h1>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {options.map((text, i) => (
            <OptionButton key={i} index={i} text={text} state={stateOf(i)} disabled={over || pending} onClick={() => void act({ action: "answer", choice: i, question: v.index })} />
          ))}
        </div>

        {!over ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <JokerButton icon={SplitSquareHorizontal} label={t.fifty} desc={v.jokers.fifty ? t.jokerUsed : t.fiftyDesc} used={v.jokers.fifty} disabled={pending} onClick={() => void act({ action: "joker", kind: "fifty" })} testId="quiz-joker-fifty" />
            <JokerButton icon={Timer} label={t.extraTime} desc={v.jokers.time ? t.jokerUsed : t.extraTimeDesc} used={v.jokers.time} disabled={pending} onClick={() => void act({ action: "joker", kind: "time" })} testId="quiz-joker-time" />
          </div>
        ) : (
          <div
            className={cn("mt-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 animate-slide-up", q.result === "correct" ? "bg-emerald-400/15" : "bg-rose-500/10")}
            data-testid="quiz-result"
            data-result={q.result}
          >
            {q.result === "correct" ? <Check className="h-5 w-5 text-emerald-300" /> : <X className="h-5 w-5 text-rose-300" />}
            <div className="min-w-0 flex-1">
              <div className={cn("font-display font-bold", q.result === "correct" ? "text-emerald-200" : "text-rose-200")}>
                {q.result === "correct" ? `${t.correct} ${t.pointsEarned(q.points)}` : q.result === "timeout" ? t.timeout : q.result === "skipped" ? t.skipped : t.wrong}
              </div>
              {q.result !== "correct" && q.correct !== null && (
                <div className="text-sm text-zinc-300">
                  {t.rightAnswer}: <span className="font-semibold text-white">{options[q.correct]}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() => (v.finished ? setSummaryOpen(true) : void act({ action: "next" }))}
              data-testid="quiz-next"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} {v.finished ? t.seeResults : t.next}
            </button>
          </div>
        )}
      </section>

      {v.history.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {v.history.map((h) => (
            <span
              key={h.number}
              className={cn("flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-[11px] font-bold", h.result === "correct" ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-500/15 text-rose-200")}
            >
              {h.result === "correct" ? `+${h.points}` : "✕"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent, testId }: { label: string; value: React.ReactNode; accent?: string; testId?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={cn("font-display font-bold text-white", accent)} data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

function JokerButton({
  icon: Icon,
  label,
  desc,
  used,
  disabled,
  onClick,
  testId,
}: {
  icon: typeof Timer;
  label: string;
  desc: string;
  used: boolean;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      disabled={used || disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition",
        used ? "border-white/5 bg-transparent text-zinc-600" : "border-amber-300/30 bg-amber-400/10 text-amber-100 enabled:hover:border-amber-300/70",
      )}
      data-testid={testId}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block truncate text-[11px] opacity-80">{desc}</span>
      </span>
    </button>
  );
}

function Summary({ v, t, locale, onPlayAgain, restarting, error }: { v: RunView; t: QuizTexts; locale: Locale; onPlayAgain: () => void; restarting: boolean; error: string | null }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10" data-testid="quiz-summary">
      <section className="glass-strong relative overflow-hidden rounded-3xl p-6 text-center">
        <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full bg-amber-400/20 blur-3xl" />
        <Trophy className="relative mx-auto h-9 w-9 text-amber-300" />
        <h1 className="relative mt-2 font-display text-3xl font-black text-white">{v.kind === "daily" ? t.dailyFinished : t.finished}</h1>
        <div className="relative mt-4 text-[11px] uppercase tracking-widest text-zinc-500">{t.finalScore}</div>
        <div className="relative font-display text-5xl font-black text-amber-200" data-testid="quiz-final-score">
          {v.score}
        </div>
        <p className="relative mt-2 text-sm text-zinc-300">
          {t.correctCount(v.correct, v.total)} · {t.bestStreakLine(v.bestStreak)}
        </p>
        {v.kind === "daily" && <p className="relative mt-1 text-sm text-zinc-400">{t.comeBackTomorrow}</p>}
        <FormError message={error} />
        <div className="relative mt-5 flex flex-wrap justify-center gap-2">
          {v.kind === "solo" && (
            <button type="button" className="btn btn-primary" onClick={onPlayAgain} disabled={restarting} data-testid="quiz-play-again">
              {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} {t.playAgain}
            </button>
          )}
          <Link href="/quiz" className="btn btn-ghost">
            {t.backToHub}
          </Link>
        </div>
      </section>

      <section className="glass rounded-3xl p-4 sm:p-5">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.review}</h2>
        <ol className="space-y-2">
          {v.history.map((h) => (
            <li key={h.number} className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-sm">
              <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", h.result === "correct" ? "bg-emerald-400/20 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
                {h.result === "correct" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-zinc-200">{h.q[locale]}</div>
                <div className="text-xs text-zinc-400">
                  {t.rightAnswer}: <span className="font-semibold text-white">{h.answer[locale]}</span>
                </div>
              </div>
              <span className={cn("shrink-0 font-display text-sm font-bold", h.result === "correct" ? "text-emerald-200" : "text-zinc-500")}>
                {h.result === "correct" ? `+${h.points}` : h.result === "timeout" ? t.timeout : h.result === "skipped" ? t.skipped : "0"}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
