import Link from "next/link";
import { ArrowRight, Eye, Gavel, Radio, ShieldCheck, Sparkles, Timer, Trophy, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import { ENABLED_ANIME } from "@/data/anime";
import { RARITIES, RARITY_INFO } from "@/game/rarity";
import { GAME_RULES } from "@/game/config";
import { shuffle } from "@/game/rules";
import { CharacterArt } from "@/components/character/CharacterArt";
import { RarityBadge } from "@/components/character/badges";
import { LiveStats } from "@/components/LiveStats";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, featuredRows, counts, recentSales] = await Promise.all([
    getCurrentUser(),
    prisma.character.findMany({
      where: { ...enabledCharacterWhere, rarity: { in: ["MYTHIC", "LEGENDARY"] }, imageUrl: { not: null } },
      include: { anime: { select: { name: true, shortName: true } } },
    }),
    prisma.character.groupBy({ by: ["animeId"], where: enabledCharacterWhere, _count: { _all: true } }),
    prisma.auctionLot.findMany({
      where: { status: "SOLD" },
      orderBy: { endedAt: "desc" },
      take: 14,
      include: { character: { select: { name: true, animeId: true, imageUrl: true, rarity: true } }, winner: { select: { username: true } } },
    }),
  ]);
  const featured = shuffle(featuredRows.map(toCharacterDTO)).slice(0, 3);
  const countOf = (id: string) => counts.find((c) => c.animeId === id)?._count._all ?? 0;
  const total = counts.reduce((s, c) => s + c._count._all, 0);
  const tilts = ["-8deg", "4deg", "10deg"];

  return (
    <div className="space-y-24">
      {/* Hero */}
      <section className="relative grid items-center gap-12 pt-6 lg:grid-cols-2">
        <div className="animate-slide-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-rose-200">
            <Radio className="h-3.5 w-3.5 animate-pulse" /> Real-time multiplayer auctions
          </div>
          <h1 className="mt-6 font-display text-5xl font-black leading-[1.02] tracking-tight text-white md:text-7xl">
            Outbid your rival.
            <br />
            <span className="text-gradient">Own the legends.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-zinc-300">
            Two players. ${GAME_RULES.startingBalance} each. One character on the block and a ticking clock. Bid live for heroes and villains from{" "}
            {ENABLED_ANIME.map((a) => a.shortName).join(", ").replace(/, ([^,]*)$/, " and $1")} — every win joins your permanent collection.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={user ? "/play" : "/register?next=/play"} className="btn btn-primary !px-7 !py-4 !text-base" data-testid="hero-play">
              <Gavel className="h-5 w-5" /> {user ? "Play now" : "Start bidding free"}
            </Link>
            <Link href="/characters" className="btn btn-ghost !px-7 !py-4 !text-base">
              Browse {total} characters <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Virtual currency only — no deposits, no withdrawals, no real money.
          </p>
        </div>

        <div className="relative hidden h-[520px] lg:block" aria-hidden>
          <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-600/30 blur-3xl animate-pulse-glow" />
          {featured.map((c, i) => {
            const info = RARITY_INFO[c.rarity];
            const pos = ["left-0 top-16", "left-1/2 top-0 -translate-x-1/2 z-10", "right-0 top-24"][i];
            return (
              <div
                key={c.id}
                className={`absolute ${pos} w-56 ${i === 1 ? "animate-float" : "animate-float-slow"}`}
                style={{ ["--tilt" as string]: tilts[i], animationDelay: `${i * 0.8}s` }}
              >
                <div className="shine overflow-hidden rounded-3xl border-2 bg-ink-900 shadow-2xl" style={{ borderColor: info.color, boxShadow: `0 30px 80px -20px ${info.glow}` }}>
                  <div className="relative aspect-[3/4]">
                    <CharacterArt name={c.name} animeId={c.animeId} imageUrl={c.imageUrl} eager />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                    <div className="absolute left-3 top-3">
                      <RarityBadge rarity={c.rarity} />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <div className="font-display text-lg font-bold text-white">{c.name}</div>
                      <div className="text-xs text-zinc-300">{c.animeName}</div>
                    </div>
                  </div>
                </div>
                {i === 1 && (
                  <div className="glass-strong absolute left-1/2 top-full mt-5 w-56 -translate-x-1/2 rounded-2xl p-3 neon-border-red">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span>Current bid</span>
                      <span className="flex items-center gap-1 text-rose-300">
                        <Timer className="h-3 w-3" /> 0:04
                      </span>
                    </div>
                    <div className="font-display text-3xl font-black text-neon-red">$11</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <LiveStats />

      {/* Recent sales ticker */}
      {recentSales.length > 0 && (
        <section className="relative -mx-4 overflow-hidden border-y border-white/5 bg-black/20 py-4">
          <div className="flex w-max animate-marquee gap-8">
            {[...recentSales, ...recentSales].map((s, i) => (
              <div key={`${s.id}-${i}`} className="flex items-center gap-3 text-sm">
                <div className="h-10 w-8 overflow-hidden rounded border" style={{ borderColor: RARITY_INFO[s.character.rarity].color }}>
                  <CharacterArt name={s.character.name} animeId={s.character.animeId} imageUrl={s.character.imageUrl} />
                </div>
                <span className="text-zinc-300">
                  <b className="text-white">{s.character.name}</b> sold to <span className="text-purple-300">{s.winner?.username ?? "—"}</span> for{" "}
                  <b className="text-rose-300">${s.finalPrice}</b>
                </span>
                <span className="text-xs text-zinc-600">{s.endedAt ? timeAgo(s.endedAt) : ""}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section>
        <div className="mb-10 text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-purple-300/80">How it works</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-white md:text-5xl">Four steps to a legendary collection</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { icon: Wallet, title: `$${GAME_RULES.startingBalance} each`, text: "Both players start every match with the same virtual balance. Spend it wisely." },
            { icon: Eye, title: "Reveal", text: "A random character from the supported anime appears to both players at the same instant." },
            { icon: Timer, title: "Bid live", text: `Raise by at least $${GAME_RULES.minIncrement}. Late bids trigger overtime so nobody gets sniped.` },
            { icon: Trophy, title: "Collect", text: "Highest bid at zero wins. The character joins your collection and your match score." },
          ].map((s, i) => (
            <div key={s.title} className="glass relative overflow-hidden rounded-3xl p-6 animate-slide-up" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="absolute right-4 top-3 font-display text-6xl font-black text-white/5">{i + 1}</div>
              <s.icon className="h-8 w-8 text-purple-300" />
              <h3 className="mt-4 font-display text-xl font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Anime */}
      <section>
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-purple-300/80">Supported anime</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-white md:text-5xl">Six worlds. One auction house.</h2>
          </div>
          <Link href="/characters" className="btn btn-ghost">
            Character database <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ENABLED_ANIME.map((a) => (
            <Link
              key={a.id}
              href={`/characters?anime=${a.id}`}
              className="glass group relative overflow-hidden rounded-3xl p-6 transition hover:-translate-y-1"
              style={{ borderColor: `${a.color}33` }}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl transition group-hover:scale-125" style={{ background: `${a.color}33` }} />
              <div className="relative">
                <div className="font-display text-2xl font-bold" style={{ color: a.color }}>
                  {a.shortName}
                </div>
                <p className="mt-2 text-sm text-zinc-400">{a.description}</p>
                <div className="mt-5 flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{countOf(a.id)} characters</span>
                  <ArrowRight className="h-4 w-4 text-zinc-500 transition group-hover:translate-x-1 group-hover:text-white" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Rarity */}
      <section className="glass-strong relative overflow-hidden rounded-3xl p-8 md:p-12 neon-border">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-purple-700/30 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <Sparkles className="h-8 w-8 text-amber-300" />
            <h2 className="mt-3 font-display text-3xl font-bold text-white md:text-4xl">Rarity drives the stakes</h2>
            <p className="mt-3 text-zinc-300">
              Rarer characters open at a higher price and are worth more points. After the last lot, the player with the higher collection score wins the match —
              ties go to whoever kept more money.
            </p>
            <Link href={user ? "/play" : "/register?next=/play"} className="btn btn-primary mt-6">
              {user ? "Enter the auction" : "Create your account"}
            </Link>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {RARITIES.map((r) => (
              <div key={r} className="rounded-2xl border p-3 text-center" style={{ borderColor: `${RARITY_INFO[r].color}55`, background: `${RARITY_INFO[r].color}0d` }}>
                <div className="font-display text-xs font-bold uppercase" style={{ color: RARITY_INFO[r].color }}>
                  {RARITY_INFO[r].label}
                </div>
                <div className="mt-2 font-display text-2xl font-black text-white">{RARITY_INFO[r].points}</div>
                <div className="text-[10px] text-zinc-400">points</div>
                <div className="mt-2 text-xs text-zinc-300">from ${RARITY_INFO[r].startingPrice}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
