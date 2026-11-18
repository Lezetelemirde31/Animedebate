"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Crown, Loader2, Swords, Users, X } from "lucide-react";
import { api } from "@/lib/client-api";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { FormError } from "@/components/ui/primitives";
import { VERSUS_TEXT } from "./texts";

interface QueueStatus {
  inQueue: boolean;
  since: number | null;
  matchedCode: string | null;
  rating: number;
}

type Busy = null | "friendly" | "join" | "EASY" | "NORMAL" | "HARD";

export function VersusHub({
  signedIn,
  activeCode,
  autoRanked,
  rating,
}: {
  signedIn: boolean;
  activeCode: string | null;
  autoRanked: boolean;
  rating: React.ReactNode;
}) {
  const { locale } = useLanguage();
  const t = VERSUS_TEXT[locale];
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [activeLink, setActiveLink] = useState<string | null>(activeCode);
  const [busy, setBusy] = useState<Busy>(null);
  const [code, setCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchStart, setSearchStart] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const searchingRef = useRef(false);

  const fail = useCallback((res: { message: string; data?: { code?: string } }) => {
    setError(res.message || null);
    if (res.data?.code) setActiveLink(res.data.code);
  }, []);

  const stopSearch = useCallback(async (notify: boolean) => {
    searchingRef.current = false;
    setSearching(false);
    if (notify) await api("/api/versus/queue", { method: "DELETE" });
  }, []);

  const startSearch = useCallback(async () => {
    if (searchingRef.current) return;
    setError(null);
    searchingRef.current = true;
    setSearching(true);
    setSearchStart(Date.now());
    let join = true;
    while (searchingRef.current) {
      const res = await api<QueueStatus>("/api/versus/queue", { body: { join } });
      if (!searchingRef.current) break;
      if (!res.ok) {
        if (res.message) {
          fail(res);
          searchingRef.current = false;
          setSearching(false);
          return;
        }
      } else {
        join = false;
        if (res.data.matchedCode) {
          searchingRef.current = false;
          router.push(`/versus/${res.data.matchedCode}`);
          return;
        }
        if (!res.data.inQueue) join = true;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, [fail, router]);

  // Leave the queue when the page is closed mid-search.
  useEffect(() => {
    const onHide = () => {
      if (searchingRef.current) navigator.sendBeacon?.("/api/versus/queue/leave");
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (searchingRef.current) {
        searchingRef.current = false;
        void api("/api/versus/queue", { method: "DELETE" });
      }
    };
  }, []);

  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - searchStart) / 1000)), 500);
    return () => clearInterval(id);
  }, [searching, searchStart]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoRanked && signedIn && !activeCode && !autoStarted.current) {
      autoStarted.current = true;
      router.replace("/versus");
      void startSearch();
    }
  }, [autoRanked, signedIn, activeCode, router, startSearch]);

  async function create(body: { mode: "friendly" } | { mode: "bot"; level: "EASY" | "NORMAL" | "HARD" }) {
    setError(null);
    setBusy(body.mode === "friendly" ? "friendly" : body.level);
    const res = await api<{ code: string }>("/api/versus/matches", { body });
    if (res.ok) {
      router.push(`/versus/${res.data.code}`);
      return;
    }
    setBusy(null);
    fail(res);
  }

  function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 4) return;
    setBusy("join");
    router.push(`/versus/${c}`);
  }

  const login = (
    <Link href="/login?next=/versus" className="btn btn-primary w-full">
      {t.loginToPlay}
    </Link>
  );
  const locked = searching || busy !== null;

  return (
    <div className="space-y-4">
      {activeLink && (
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl border-cyan-400/40 px-4 py-3 text-sm" data-testid="versus-active">
          <Swords className="h-4 w-4 text-cyan-300" />
          <span className="text-zinc-200">{t.activeMatch(activeLink)}</span>
          <Link href={`/versus/${activeLink}`} className="btn btn-primary ml-auto px-4 py-1.5 text-sm">
            {t.backToMatch}
          </Link>
        </div>
      )}
      <FormError message={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Ranked */}
        <section className="glass-strong relative flex flex-col overflow-hidden rounded-3xl p-5" style={{ borderColor: "#22d3ee55" }}>
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
          <Crown className="relative h-7 w-7 text-cyan-300" />
          <h2 className="relative mt-2 font-display text-xl font-bold text-white">{t.ranked}</h2>
          <p className="relative mt-1 text-sm text-zinc-400">{t.rankedDesc}</p>
          {signedIn && (
            <div className="relative mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-widest text-zinc-500">{t.yourRating}</div>
              <div className="mt-1">{rating}</div>
            </div>
          )}
          <div className="relative mt-auto pt-4">
            {!signedIn ? (
              login
            ) : searching ? (
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2.5 text-sm font-semibold text-cyan-100" data-testid="versus-searching">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t.searching} <span className="tabular-nums text-cyan-300">{t.searchingFor(elapsed)}</span>
                </div>
                <button type="button" className="btn btn-ghost px-3" onClick={() => void stopSearch(true)} aria-label={t.cancel}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-primary w-full" disabled={locked || !!activeLink} onClick={() => void startSearch()} data-testid="versus-find">
                <Swords className="h-4 w-4" /> {t.findMatch}
              </button>
            )}
          </div>
        </section>

        {/* Friendly */}
        <section className="glass relative flex flex-col rounded-3xl p-5">
          <Users className="h-7 w-7 text-purple-300" />
          <h2 className="mt-2 font-display text-xl font-bold text-white">{t.friendly}</h2>
          <p className="mt-1 text-sm text-zinc-400">{t.friendlyDesc}</p>
          <div className="mt-auto space-y-2 pt-4">
            {!signedIn ? (
              login
            ) : (
              <>
                <button type="button" className="btn btn-primary w-full" disabled={locked || !!activeLink} onClick={() => void create({ mode: "friendly" })} data-testid="versus-create-friendly">
                  {busy === "friendly" && <Loader2 className="h-4 w-4 animate-spin" />} {t.createRoom}
                </button>
                <form onSubmit={joinByCode} className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder={t.joinCode}
                    maxLength={8}
                    className="input min-w-0 flex-1 font-display uppercase tracking-widest"
                    aria-label={t.joinCode}
                    data-testid="versus-join-code"
                  />
                  <button type="submit" className="btn btn-ghost" disabled={locked || code.trim().length < 4}>
                    {t.join}
                  </button>
                </form>
              </>
            )}
          </div>
        </section>

        {/* Practice */}
        <section className="glass relative flex flex-col rounded-3xl p-5">
          <Bot className="h-7 w-7 text-emerald-300" />
          <h2 className="mt-2 font-display text-xl font-bold text-white">{t.practice}</h2>
          <p className="mt-1 text-sm text-zinc-400">{t.practiceDesc}</p>
          <div className="mt-auto grid grid-cols-3 gap-2 pt-4">
            {!signedIn ? (
              <div className="col-span-3">{login}</div>
            ) : (
              (["EASY", "NORMAL", "HARD"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  className="btn btn-ghost px-2"
                  disabled={locked || !!activeLink}
                  onClick={() => void create({ mode: "bot", level })}
                  data-testid={`versus-bot-${level}`}
                >
                  {busy === level && <Loader2 className="h-4 w-4 animate-spin" />} {t.levels[level]}
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
