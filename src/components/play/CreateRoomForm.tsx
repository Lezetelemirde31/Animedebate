"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Globe, Lock, Plus } from "lucide-react";
import { GAME_RULES } from "@/game/config";
import { ENABLED_ANIME } from "@/data/anime";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { api } from "@/lib/client-api";
import { FormError, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function CreateRoomForm({ characterCounts }: { characterCounts: Record<string, number> }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [isPrivate, setPrivate] = useState(true);
  const [totalLots, setLots] = useState<number>(GAME_RULES.defaultLots);
  const [bidSeconds, setTimer] = useState<number>(GAME_RULES.defaultTimer);
  const [animeIds, setAnime] = useState<string[]>(ENABLED_ANIME.map((a) => a.id));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poolSize = animeIds.reduce((sum, id) => sum + (characterCounts[id] ?? 0), 0);

  function toggleAnime(id: string) {
    setAnime((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (animeIds.length === 0) return setError(t.play.pickOneAnime);
    setPending(true);
    const res = await api<{ code: string }>("/api/live/rooms", { body: { isPrivate, totalLots, bidSeconds, animeIds } });
    if (!res.ok) {
      setError(res.message || t.play.couldNotCreateRoom);
      setPending(false);
      return;
    }
    router.push(`/room/${res.data.code}`);
  }

  return (
    <form onSubmit={create} className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="glass rounded-3xl p-6">
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.play.visibility}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { value: true, icon: Lock, title: t.play.privateTitle, text: t.play.privateDesc },
              { value: false, icon: Globe, title: t.play.publicTitle, text: t.play.publicDesc },
            ].map((o) => (
              <button
                type="button"
                key={o.title}
                onClick={() => setPrivate(o.value)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition",
                  isPrivate === o.value ? "border-purple-500/60 bg-purple-500/10 neon-border" : "border-white/10 bg-white/[0.02] hover:border-white/20",
                )}
                aria-pressed={isPrivate === o.value}
              >
                <o.icon className="h-5 w-5 text-purple-300" />
                <div className="mt-2 font-display font-semibold text-white">{o.title}</div>
                <div className="text-xs text-zinc-400">{o.text}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="glass rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.play.animePool}</h2>
            <button
              type="button"
              className="text-xs text-purple-300 hover:text-purple-200"
              onClick={() => setAnime(animeIds.length === ENABLED_ANIME.length ? [] : ENABLED_ANIME.map((a) => a.id))}
            >
              {animeIds.length === ENABLED_ANIME.length ? t.play.clearAll : t.play.selectAll}
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ENABLED_ANIME.map((a) => {
              const active = animeIds.includes(a.id);
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => toggleAnime(a.id)}
                  className={cn("relative rounded-2xl border p-4 text-left transition", active ? "bg-white/[0.06]" : "border-white/10 opacity-60 hover:opacity-100")}
                  style={active ? { borderColor: `${a.color}88`, boxShadow: `0 0 24px -10px ${a.color}` } : undefined}
                  aria-pressed={active}
                >
                  {active && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: a.color }}>
                      <Check className="h-3 w-3 text-black" />
                    </span>
                  )}
                  <div className="font-display font-semibold" style={{ color: a.color }}>
                    {a.shortName}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">{t.home.charactersCount(characterCounts[a.id] ?? 0)}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="glass grid gap-6 rounded-3xl p-6 sm:grid-cols-2">
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.play.lotsPerMatch}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {GAME_RULES.lotOptions.map((n) => (
                <button type="button" key={n} className="chip !px-4 !py-2" data-active={totalLots === n} onClick={() => setLots(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.play.bidTimer}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {GAME_RULES.timerOptions.map((n) => (
                <button type="button" key={n} className="chip !px-4 !py-2" data-active={bidSeconds === n} onClick={() => setTimer(n)}>
                  {n}{t.auction.secLabel}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <aside className="glass-strong h-fit rounded-3xl p-6 neon-border lg:sticky lg:top-24">
        <h2 className="font-display text-lg font-bold text-white">{t.play.roomSummary}</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-400">{t.play.visibility}</dt>
            <dd className="text-white">{isPrivate ? t.play.privateTitle : t.play.publicTitle}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-400">{t.play.startingBalance}</dt>
            <dd className="text-white">{t.play.eachBal(GAME_RULES.startingBalance)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-400">{t.play.lotsLabel}</dt>
            <dd className="text-white">{totalLots}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-400">{t.play.timerLabel}</dt>
            <dd className="text-white">{t.play.overtimeFmt(bidSeconds, GAME_RULES.overtimeSeconds)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-400">{t.play.characterPool}</dt>
            <dd className={cn(poolSize < totalLots ? "text-rose-300" : "text-white")}>{t.home.charactersCount(poolSize)}</dd>
          </div>
        </dl>
        <FormError message={poolSize < totalLots && animeIds.length > 0 ? t.play.notEnoughChars : error} />
        <button
          type="submit"
          className="btn btn-primary mt-6 w-full !py-3.5"
          disabled={pending || animeIds.length === 0 || poolSize < totalLots}
          data-testid="create-room-submit"
        >
          {pending ? <Spinner className="h-4 w-4 text-white" /> : <Plus className="h-4 w-4" />}
          {t.play.createRoom}
        </button>
      </aside>
    </form>
  );
}
