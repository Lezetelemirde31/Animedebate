import Link from "next/link";
import { ArrowRight, Eye, Flame, Gavel, MessageSquare, Radio, ShieldCheck, Sparkles, Swords, Timer, Trophy, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import { ENABLED_ANIME } from "@/data/anime";
import { RARITIES, RARITY_INFO } from "@/game/rarity";
import { GAME_RULES } from "@/game/config";
import { shuffle } from "@/game/rules";
import { ANIME_DESCRIPTIONS, RARITY_LABELS } from "@/lib/i18n";
import { getServerTranslations } from "@/lib/i18n-server";
import { CharacterArt } from "@/components/character/CharacterArt";
import { RarityBadge } from "@/components/character/badges";
import { LiveStats } from "@/components/LiveStats";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ locale, t }, user, featuredRows, counts, recentSales, topDebates, topComparisons] = await Promise.all([
    getServerTranslations(),
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
    prisma.debate.findMany({
      where: { status: { not: "HIDDEN" } },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 3,
      include: { author: { select: { username: true, level: true } } },
    }),
    prisma.characterComparison.findMany({
      where: { status: { not: "HIDDEN" } },
      orderBy: { createdAt: "desc" },
      take: 2,
      include: {
        characterA: { select: { name: true } },
        characterB: { select: { name: true } },
      },
    }),
  ]);
  const featured = shuffle(featuredRows.map(toCharacterDTO)).slice(0, 3);
  const countOf = (id: string) => counts.find((c) => c.animeId === id)?._count._all ?? 0;
  const total = counts.reduce((s, c) => s + c._count._all, 0);
  const tilts = ["-8deg", "4deg", "10deg"];
  const animeNamesList = ENABLED_ANIME.map((a) => a.shortName).join(", ").replace(/, ([^,]*)$/, ` ${t.home.andWord} $1`);

  return (
    <div className="space-y-24">
      {/* Hero */}
      <section className="relative grid items-center gap-12 pt-6 lg:grid-cols-2">
        <div className="animate-slide-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-rose-200">
            <Radio className="h-3.5 w-3.5 animate-pulse" /> {t.home.badge}
          </div>
          <h1 className="mt-6 break-words font-display text-4xl font-black leading-[1.04] tracking-tight text-white sm:text-5xl md:text-7xl">
            {t.home.heroLine1}
            <br />
            <span className="text-gradient">{t.home.heroLine2}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-zinc-300">
            {t.home.heroDescPrefix} ${GAME_RULES.startingBalance} {t.home.heroDescMid} {animeNamesList} {t.home.heroDescSuffix}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={user ? "/play" : "/register?next=/play"} className="btn btn-primary !px-7 !py-4 !text-base" data-testid="hero-play">
              <Gavel className="h-5 w-5" /> {user ? t.home.playNow : t.home.startFree}
            </Link>
            <Link href="/characters" className="btn btn-ghost !px-7 !py-4 !text-base">
              {t.home.browseChars(total)} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" /> {t.home.virtualNote}
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
                      <RarityBadge rarity={c.rarity} locale={locale} />
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
                      <span>{t.home.currentBid}</span>
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
        <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-black/25 py-4">
          <div className="flex w-max animate-marquee gap-8 will-change-transform">
            {[...recentSales, ...recentSales].map((s, i) => (
              <div key={`${s.id}-${i}`} className="flex items-center gap-3 text-sm">
                <div className="h-10 w-8 overflow-hidden rounded border" style={{ borderColor: RARITY_INFO[s.character.rarity].color }}>
                  <CharacterArt name={s.character.name} animeId={s.character.animeId} imageUrl={s.character.imageUrl} />
                </div>
                <span className="text-zinc-300">
                  <b className="text-white">{s.character.name}</b> {t.home.soldTo} <span className="text-purple-300">{s.winner?.username ?? "—"}</span> {t.home.forWord}{" "}
                  <b className="text-rose-300">${s.finalPrice}</b>
                </span>
                <span className="text-xs text-zinc-600">{s.endedAt ? timeAgo(s.endedAt, locale) : ""}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section>
        <div className="mb-10 text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-purple-300/80">{t.home.howEyebrow}</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-white md:text-5xl">{t.home.howTitle}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { icon: Wallet, title: t.home.step1Title(GAME_RULES.startingBalance), text: t.home.step1Text },
            { icon: Eye, title: t.home.step2Title, text: t.home.step2Text },
            { icon: Timer, title: t.home.step3Title, text: t.home.step3Text(GAME_RULES.minIncrement) },
            { icon: Trophy, title: t.home.step4Title, text: t.home.step4Text },
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
            <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-purple-300/80">{t.home.animeEyebrow}</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-white md:text-5xl">{t.home.animeTitle}</h2>
          </div>
          <Link href="/characters" className="btn btn-ghost">
            {t.home.charDatabase} <ArrowRight className="h-4 w-4" />
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
                <p className="mt-2 text-sm text-zinc-400">{ANIME_DESCRIPTIONS[locale][a.id] ?? a.description}</p>
                <div className="mt-5 flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{t.home.charactersCount(countOf(a.id))}</span>
                  <ArrowRight className="h-4 w-4 text-zinc-500 transition group-hover:translate-x-1 group-hover:text-white" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Rarity */}
      <section className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-8 md:p-12 neon-border">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-purple-700/30 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <Sparkles className="h-8 w-8 text-amber-300" />
            <h2 className="mt-3 font-display text-3xl font-bold text-white md:text-4xl">{t.home.rarityTitle}</h2>
            <p className="mt-3 text-zinc-300">{t.home.rarityDesc}</p>
            <Link href={user ? "/play" : "/register?next=/play"} className="btn btn-primary mt-6">
              {user ? t.home.enterAuction : t.home.createAccount}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {RARITIES.map((r) => (
              <div key={r} className="rounded-2xl border p-3 text-center" style={{ borderColor: `${RARITY_INFO[r].color}55`, background: `${RARITY_INFO[r].color}0d` }}>
                <div className="font-display text-xs font-bold uppercase" style={{ color: RARITY_INFO[r].color }}>
                  {RARITY_LABELS[locale][r]}
                </div>
                <div className="mt-2 font-display text-2xl font-black text-white">{RARITY_INFO[r].points}</div>
                <div className="text-[10px] text-zinc-400">{t.home.points}</div>
                <div className="mt-2 text-xs text-zinc-300">{t.home.fromPrice(RARITY_INFO[r].startingPrice)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Anime Debate & VS Arena */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-white">
              <Flame className="h-5 w-5 text-rose-400" /> {t.home.hotDebates}
            </h2>
            <Link href="/debates" className="text-sm text-purple-300 hover:text-purple-200">
              {t.home.allDebates}
            </Link>
          </div>
          {topDebates.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.home.noDebatesYet}</p>
          ) : (
            <div className="space-y-3">
              {topDebates.map((d) => (
                <Link key={d.id} href={`/debates/${d.slug}`} className="block rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-purple-500/40">
                  <div className="font-display font-semibold text-white">{d.title}</div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-400">
                    <span>
                      {d.author.username} · {t.nav.levelShort}.{d.author.level}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5 text-purple-300" /> {d.commentsCount}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-white">
              <Swords className="h-5 w-5 text-purple-300" /> {t.home.vsMatchups}
            </h2>
            <Link href="/comparisons" className="text-sm text-purple-300 hover:text-purple-200">
              {t.home.allMatchups}
            </Link>
          </div>
          {topComparisons.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.home.noComparisonsYet}</p>
          ) : (
            <div className="space-y-3">
              {topComparisons.map((c) => {
                const totalVotes = c.votesACount + c.votesBCount;
                const pctA = totalVotes > 0 ? Math.round((c.votesACount / totalVotes) * 100) : 50;
                return (
                  <Link key={c.id} href={`/comparisons/${c.slug}`} className="block rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-purple-500/40">
                    <div className="font-display font-semibold text-white">{c.title}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      {c.characterA.name} ({pctA}%) vs {c.characterB.name} ({100 - pctA}%) · {totalVotes} {t.home.votesWord}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
