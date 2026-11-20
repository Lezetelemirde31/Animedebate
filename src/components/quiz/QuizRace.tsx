"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Crown, Loader2, LogOut, Share2, Trophy, Users, WifiOff, X } from "lucide-react";
import { api, isNetworkFailure } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { ENABLED_ANIME, getAnime } from "@/data/anime";
import { QUIZ_DIFFICULTIES, RACE_MAX_PLAYERS, RACE_QUESTION_CHOICES } from "@/game/quiz/rules";
import type { QuizRaceSettings, QuizRaceView } from "@/server/quiz/race";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorState, FormError, Spinner } from "@/components/ui/primitives";
import { OptionButton, type OptionState } from "./OptionButton";
import { QUIZ_TEXT, type QuizTexts } from "./texts";

type Action =
  | { action: "sync" }
  | { action: "join" }
  | { action: "leave" }
  | { action: "start" }
  | { action: "settings"; settings: Partial<QuizRaceSettings> }
  | { action: "answer"; choice: number; question: number }
  | { action: "rematch" };

export function QuizRace({ code }: { code: string }) {
  const { locale } = useLanguage();
  const t = QUIZ_TEXT[locale];
  const router = useRouter();
  const [v, setV] = useState<QuizRaceView | null>(null);
  const [fatal, setFatal] = useState<{ message: string; activeCode?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [netDown, setNetDown] = useState(false);
  const [pending, setPending] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const offset = useRef(0);
  const seq = useRef(0);
  const applied = useRef(0);
  const phaseRef = useRef<string | null>(null);
  const [, setTick] = useState(0);

  const send = useCallback(
    async (a: Action) => {
      const mine = ++seq.current;
      const res = await api<QuizRaceView>(`/api/quiz/rooms/${code}`, { body: a });
      if (res.ok) {
        setNetDown(false);
        if (mine > applied.current) {
          applied.current = mine;
          offset.current = res.data.serverNow - Date.now();
          phaseRef.current = res.data.phase;
          setV(res.data);
        }
      } else if (isNetworkFailure(res)) setNetDown(true);
      return res;
    },
    [code],
  );

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
      timer = setTimeout(() => void loop(false), phase === "FINISHED" || document.hidden ? 3000 : 1000);
    };
    void loop(true);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [send]);

  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(iv);
  }, []);

  const act = useCallback(
    async (a: Action) => {
      setError(null);
      setPending(true);
      const res = await send(a);
      setPending(false);
      if (!res.ok && res.message) setError(res.message);
      return res;
    },
    [send],
  );

  // When a question's start time arrives, fetch it right away instead of waiting for the next poll.
  const startAt = v?.question && !v.question.q.tr ? v.question.startedAt : null;
  useEffect(() => {
    if (!startAt) return;
    const timer = setTimeout(() => void send({ action: "sync" }), Math.max(0, startAt - (Date.now() + offset.current) + 80));
    return () => clearTimeout(timer);
  }, [startAt, send]);

  if (fatal) {
    return (
      <ErrorState
        title={fatal.message || t.notFound}
        action={
          <>
            {fatal.activeCode && (
              <Link href={`/quiz/room/${fatal.activeCode}`} className="btn btn-primary">
                {t.backToRoom}
              </Link>
            )}
            <Link href="/quiz" className="btn btn-ghost">
              {t.backToHub}
            </Link>
          </>
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

  const isPlayer = v.me !== null && v.players.some((p) => p.userId === v.me && !p.left);

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-10" data-testid="quiz-race" data-phase={v.phase}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/quiz" className="btn btn-ghost px-3 py-1.5 text-sm" aria-label={t.title}>
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{t.title}</span>
        </Link>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">{v.mode === "ranked" ? t.ranked : t.race}</span>
        <span className="font-display text-xs tracking-widest text-zinc-500">#{v.code}</span>
        {netDown && (
          <span className="flex items-center gap-1 text-xs text-amber-300">
            <WifiOff className="h-3.5 w-3.5" /> {t.connectionLost}
          </span>
        )}
        {isPlayer && (v.phase === "LOBBY" || v.phase === "PLAYING") && (
          <div className="ml-auto">
            {askLeave ? (
              <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                <span>{t.leaveConfirm}</span>
                <button
                  type="button"
                  className="btn px-3 py-1 text-xs"
                  style={{ background: "#e11d48", color: "white" }}
                  onClick={async () => {
                    setAskLeave(false);
                    await act({ action: "leave" });
                    router.push("/quiz");
                  }}
                  data-testid="quiz-leave-confirm"
                >
                  {t.leave}
                </button>
                <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setAskLeave(false)}>
                  {t.no}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-sm text-zinc-300"
                onClick={async () => {
                  if (v.phase === "LOBBY") {
                    await act({ action: "leave" });
                    router.push("/quiz");
                  } else setAskLeave(true);
                }}
                data-testid="quiz-leave"
              >
                <LogOut className="h-4 w-4" /> {t.leave}
              </button>
            )}
          </div>
        )}
      </div>
      <FormError message={error} />
      {!isPlayer && v.phase === "PLAYING" && <p className="text-sm text-zinc-400">{t.spectating}</p>}

      {v.phase === "LOBBY" && <Lobby v={v} t={t} pending={pending} act={act} />}
      {v.phase === "ABANDONED" && (
        <ErrorState
          title={t.abandoned}
          action={
            <Link href="/quiz" className="btn btn-primary">
              {t.backToHub}
            </Link>
          }
        />
      )}
      {v.phase === "PLAYING" && <Playing v={v} t={t} offset={offset.current} isPlayer={isPlayer} pending={pending} act={act} locale={locale} />}
      {v.phase === "FINISHED" && <Finished v={v} t={t} pending={pending} act={act} />}
    </div>
  );
}

// ─── Lobby ──────────────────────────────────────────────────────────────────

function Lobby({ v, t, pending, act }: { v: QuizRaceView; t: QuizTexts; pending: boolean; act: (a: Action) => Promise<unknown> }) {
  const [copied, setCopied] = useState(false);
  const isHost = v.me === v.hostId;
  const link = typeof window === "undefined" ? `/quiz/room/${v.code}` : `${window.location.origin}/quiz/room/${v.code}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const s = v.settings;
  const set = (patch: Partial<QuizRaceSettings>) => void act({ action: "settings", settings: patch });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]" data-testid="quiz-lobby">
      <section className="glass-strong rounded-3xl p-5">
        <h1 className="font-display text-2xl font-bold text-white">{t.lobbyTitle}</h1>
        <p className="mt-1 text-sm text-zinc-400">{t.lobbyHint}</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-300" data-testid="quiz-invite-link">
            {link}
          </span>
          <button
            type="button"
            className="btn btn-primary px-3 py-1.5 text-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t.copied : t.copyLink}
          </button>
          {canShare && (
            <button type="button" className="btn btn-ghost px-3 py-1.5" onClick={() => void navigator.share({ title: t.title, text: t.shareText(v.code), url: link }).catch(() => undefined)} aria-label={t.share}>
              <Share2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <h2 className="mb-2 mt-6 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.settings}</h2>
        {!isHost && <p className="mb-2 text-xs text-zinc-500">{t.onlyHost}</p>}
        <div className="space-y-3">
          <Field label={t.difficulty}>
            {QUIZ_DIFFICULTIES.map((d) => (
              <Opt key={d} active={s.difficulty === d} disabled={!isHost || pending} onClick={() => set({ difficulty: d })} testId={`quiz-diff-${d}`}>
                {t.difficulties[d]}
              </Opt>
            ))}
          </Field>
          <Field label={t.questions}>
            {RACE_QUESTION_CHOICES.map((n) => (
              <Opt key={n} active={s.questions === n} disabled={!isHost || pending} onClick={() => set({ questions: n })} testId={`quiz-count-${n}`}>
                {n}
              </Opt>
            ))}
          </Field>
          <Field label={t.anime}>
            <Opt active={!s.animeId} disabled={!isHost || pending} onClick={() => set({ animeId: null })}>
              {t.allAnime}
            </Opt>
            {ENABLED_ANIME.map((a) => (
              <Opt key={a.id} active={s.animeId === a.id} disabled={!isHost || pending} onClick={() => set({ animeId: a.id })}>
                {a.shortName}
              </Opt>
            ))}
          </Field>
          <p className="text-xs text-zinc-500">{t.difficultyDesc[s.difficulty]}</p>
        </div>
      </section>

      <aside className="space-y-3">
        <section className="glass rounded-3xl p-4">
          <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
            <Users className="h-4 w-4 text-amber-300" /> {t.players(v.players.length, RACE_MAX_PLAYERS)}
          </h2>
          <ul className="space-y-1.5" data-testid="quiz-players">
            {v.players.map((p) => (
              <li key={p.userId} className="flex items-center gap-2 text-sm">
                <Avatar username={p.username} style={p.avatar.style} imageUrl={p.avatar.imageUrl} size={26} />
                <span className="truncate text-zinc-100">
                  {p.username}
                  {p.userId === v.me && <span className="text-zinc-500"> · {t.you}</span>}
                </span>
                {p.isHost && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-200">
                    <Crown className="h-3.5 w-3.5" /> {t.host}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
        {isHost && (
          <button type="button" className="btn btn-primary w-full" disabled={pending || v.players.length < 2} onClick={() => void act({ action: "start" })} data-testid="quiz-start">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t.start}
          </button>
        )}
        {v.players.length < 2 && <p className="text-center text-xs text-zinc-500">{t.needPlayers}</p>}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Opt({ active, disabled, onClick, children, testId }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      disabled={disabled && !active}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold transition",
        active ? "border-amber-300 bg-amber-400/20 text-white" : "border-white/10 bg-white/5 text-zinc-300 enabled:hover:text-white",
        disabled && !active && "opacity-50",
      )}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

// ─── Playing ────────────────────────────────────────────────────────────────

function Playing({
  v,
  t,
  offset,
  isPlayer,
  pending,
  act,
  locale,
}: {
  v: QuizRaceView;
  t: QuizTexts;
  offset: number;
  isPlayer: boolean;
  pending: boolean;
  act: (a: Action) => Promise<unknown>;
  locale: "tr" | "en";
}) {
  const q = v.question;
  if (!q) return null;
  const now = Date.now() + offset;
  const counting = now < q.startedAt || !q.q.tr;
  const closed = q.closedAt !== null;
  const secondsLeft = Math.max(0, Math.ceil((q.endsAt - now) / 1000));
  const anime = getAnime(q.animeId);
  const answered = q.myChoice !== null;
  const stateOf = (i: number): OptionState => {
    if (q.correct !== null && i === q.correct) return "correct";
    if (q.myChoice === i) return q.correct !== null ? "wrong" : "chosen";
    return answered || closed ? "faded" : "idle";
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5">
          <span className="font-display text-sm font-bold text-white" data-testid="quiz-race-progress">
            {t.question(q.number, q.total)}
          </span>
          {!counting && !closed && (
            <span className={cn("ml-auto font-display text-sm font-bold tabular-nums", secondsLeft <= 5 ? "text-rose-300" : "text-white")}>{t.timeLeft(secondsLeft)}</span>
          )}
          {closed && q.nextAt && <span className="ml-auto text-xs text-zinc-400">{t.nextIn(Math.max(0, Math.ceil((q.nextAt - now) / 1000)))}</span>}
        </div>

        {counting ? (
          <div className="glass-strong flex min-h-[260px] flex-col items-center justify-center rounded-3xl p-6" data-testid="quiz-countdown">
            <div className="font-display text-7xl font-black text-amber-200">{Math.max(1, Math.ceil((q.startedAt - now) / 1000))}</div>
            <p className="mt-2 text-sm text-zinc-400">{q.number === 1 ? t.startsIn(Math.max(1, Math.ceil((q.startedAt - now) / 1000))) : t.question(q.number, q.total)}</p>
          </div>
        ) : (
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
              {q.options[locale].map((text, i) => (
                <OptionButton
                  key={i}
                  index={i}
                  text={text}
                  state={stateOf(i)}
                  disabled={!isPlayer || answered || closed || pending}
                  onClick={() => void act({ action: "answer", choice: i, question: q.number - 1 })}
                />
              ))}
            </div>
            {answered && !closed && <p className="mt-3 text-center text-sm text-amber-100">{t.waitingOthers}</p>}
          </section>
        )}
      </div>

      <Scoreboard v={v} t={t} />
    </div>
  );
}

function Scoreboard({ v, t }: { v: QuizRaceView; t: QuizTexts }) {
  const list = [...v.players].sort((a, b) => Number(a.left) - Number(b.left) || b.score - a.score);
  return (
    <aside className="glass h-fit rounded-3xl p-4" data-testid="quiz-scoreboard">
      <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.standings}</h2>
      <ol className="space-y-1.5">
        {list.map((p, i) => (
          <li key={p.userId} className={cn("flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm", p.userId === v.me && "bg-white/5", p.left && "opacity-50")}>
            <span className="w-4 font-display text-xs text-zinc-500">{i + 1}</span>
            <Avatar username={p.username} style={p.avatar.style} imageUrl={p.avatar.imageUrl} size={22} />
            <span className="min-w-0 flex-1 truncate text-zinc-100">{p.username}</span>
            {p.left ? (
              <span className="text-[10px] text-zinc-500">{t.left}</span>
            ) : p.gotIt === true ? (
              <Check className="h-3.5 w-3.5 text-emerald-300" />
            ) : p.gotIt === false ? (
              <X className="h-3.5 w-3.5 text-rose-300" />
            ) : p.answered ? (
              <span className="text-[10px] text-amber-200">{t.answered}</span>
            ) : null}
            <span className="w-12 text-right font-display font-bold tabular-nums text-white">{p.score}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

// ─── Finished ───────────────────────────────────────────────────────────────

function Finished({ v, t, pending, act }: { v: QuizRaceView; t: QuizTexts; pending: boolean; act: (a: Action) => Promise<unknown> }) {
  const res = v.result;
  if (!res) return null;
  const mine = res.standings.find((s) => s.userId === v.me);
  const iLeft = v.players.find((p) => p.userId === v.me)?.left;
  const tiedTop = res.standings.filter((s) => s.place === 1).length;
  const outcome = !mine ? null : iLeft ? "loss" : mine.place === 1 ? (tiedTop > 1 && v.players.length === 2 ? "draw" : "win") : "loss";
  const color = outcome === "win" ? "#f59e0b" : outcome === "loss" ? "#f43f5e" : "#a1a1aa";
  const delta = v.me && v.ratingChange ? v.ratingChange[v.me] : undefined;
  const byId = new Map(v.players.map((p) => [p.userId, p]));

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="quiz-race-result" data-outcome={outcome ?? "none"}>
      <section className="glass-strong relative overflow-hidden rounded-3xl p-6 text-center" style={{ borderColor: `${color}66` }}>
        <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full blur-3xl" style={{ background: `${color}33` }} />
        <Trophy className="relative mx-auto h-9 w-9" style={{ color }} />
        <h1 className="relative mt-2 font-display text-3xl font-black" style={{ color }}>
          {outcome === "win" ? t.youWon : outcome === "loss" ? t.youLost : outcome === "draw" ? t.draw : t.finished}
        </h1>
        {res.reason === "forfeit" && outcome === "win" && <p className="relative mt-1 text-sm text-zinc-300">{t.forfeitWin}</p>}
        {delta !== undefined && (
          <p className="relative mt-2 font-display text-lg font-bold" data-testid="quiz-rating-change">
            {t.ratingChange}: <span className={delta >= 0 ? "text-emerald-300" : "text-rose-300"}>{delta >= 0 ? `+${delta}` : delta}</span>
          </p>
        )}
      </section>

      <section className="glass rounded-3xl p-4">
        <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.standings}</h2>
        <ol className="space-y-1.5">
          {res.standings.map((s) => {
            const p = byId.get(s.userId);
            if (!p) return null;
            return (
              <li key={s.userId} className={cn("flex items-center gap-3 rounded-xl px-3 py-2", s.userId === v.me && "bg-white/5", p.left && "opacity-50")}>
                <span className={cn("w-7 font-display text-sm font-black", s.place === 1 ? "text-amber-300" : "text-zinc-500")}>{t.place(s.place)}</span>
                <Avatar username={p.username} style={p.avatar.style} imageUrl={p.avatar.imageUrl} size={28} />
                <span className="min-w-0 flex-1 truncate font-semibold text-white">
                  {p.username}
                  {p.left && <span className="ml-2 text-xs font-normal text-zinc-500">{t.left}</span>}
                </span>
                <span className="text-xs text-zinc-400">{t.correctCount(s.correct, v.settings.questions)}</span>
                <span className="w-12 text-right font-display text-lg font-bold text-white">{s.score}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-wrap justify-center gap-2">
        {v.mode === "friendly" &&
          v.me &&
          (v.rematchCode ? (
            <Link href={`/quiz/room/${v.rematchCode}`} className="btn btn-primary" data-testid="quiz-join-rematch">
              {t.joinRematch}
            </Link>
          ) : (
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void act({ action: "rematch" })} data-testid="quiz-rematch">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t.rematch}
            </button>
          ))}
        {v.mode === "ranked" && (
          <Link href="/quiz?auto=ranked" className="btn btn-primary">
            {t.playAgain}
          </Link>
        )}
        <Link href="/quiz" className="btn btn-ghost">
          {t.backToHub}
        </Link>
      </div>
    </div>
  );
}
