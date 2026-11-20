import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Medal, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { BADGE_TEXT } from "@/lib/i18n";
import { getServerTranslations } from "@/lib/i18n-server";
import { BADGES } from "@/data/badges";
import { RANKS, rankForLevel, xpForLevel } from "@/game/ranks";
import { BadgePill } from "@/components/community/BadgePill";
import { PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.progression.page.title };
}

export default async function RanksPage() {
  const [{ locale, t }, viewer] = await Promise.all([getServerTranslations(), getCurrentUser()]);
  const p = t.progression.page;

  const me = viewer
    ? await prisma.user.findUnique({
        where: { id: viewer.id },
        select: {
          level: true,
          xp: true,
          coins: true,
          debatesCount: true,
          comparisonsCount: true,
          commentsCount: true,
          likesReceived: true,
          auctionWins: true,
          matchesPlayed: true,
          matchesWon: true,
          badges: { select: { badge: { select: { slug: true } } } },
        },
      })
    : null;
  const myRank = me ? rankForLevel(me.level) : null;
  const unlocked = new Set(me?.badges.map((b) => b.badge.slug) ?? []);
  const progressOf = (rule: string): number => {
    if (!me) return 0;
    switch (rule) {
      case "DEBATES_COUNT":
        return me.debatesCount;
      case "COMPARISONS_COUNT":
        return me.comparisonsCount;
      case "COMMENTS_COUNT":
        return me.commentsCount;
      case "LIKES_RECEIVED":
        return me.likesReceived;
      case "LEVEL_REACHED":
        return me.level;
      case "AUCTION_WINS":
        return me.auctionWins;
      case "MATCHES_PLAYED":
        return me.matchesPlayed;
      case "MATCHES_WON":
        return me.matchesWon;
      default:
        return 0;
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={p.eyebrow}
        title={
          <>
            {p.headingStart} <span className="text-gradient">{p.headingAccent}</span>
          </>
        }
        description={p.description}
      />

      {me && myRank && (
        <div className="glass-strong flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5" data-testid="my-progress">
          <div className="flex items-center gap-3">
            <Medal className="h-8 w-8" style={{ color: myRank.color }} />
            <div>
              <div className="font-display text-lg font-bold text-white">{myRank.name[locale]}</div>
              <div className="text-xs text-zinc-400">
                {t.profile.levelLabel(me.level)} · {me.xp} XP
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 font-display text-2xl font-bold text-amber-200">
            <Coins className="h-6 w-6" /> {me.coins} {t.progression.coinsShort}
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{p.ranksTitle}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {RANKS.map((r) => {
            const current = myRank?.tier === r.tier;
            const reached = !!myRank && myRank.tier >= r.tier;
            return (
              <div
                key={r.id}
                className={cn("glass rounded-2xl p-4 transition", current && "neon-border", !reached && me && "opacity-60")}
                style={current ? { borderColor: `${r.color}88` } : undefined}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs text-zinc-500">#{r.tier}</span>
                  {r.coinBonus > 0 && <span className="text-[11px] font-semibold text-amber-200">{p.rankBonus(r.coinBonus)}</span>}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Medal className="h-5 w-5 shrink-0" style={{ color: r.color }} />
                  <span className="font-display font-bold" style={{ color: r.color }}>
                    {r.name[locale]}
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  {p.levelFrom(r.minLevel)} · {xpForLevel(r.minLevel)} XP
                </div>
                {current && <div className="mt-2 text-[11px] font-semibold text-purple-200">{p.you}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
          <Coins className="h-4 w-4 text-amber-300" /> {p.earnTitle}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-zinc-500">
                {p.earnHeaders.map((h, i) => (
                  <th key={h} className={cn("pb-2 font-semibold", i > 0 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {p.earnRows.map((row) => (
                <tr key={row[0]}>
                  <td className="py-2 text-zinc-200">{row[0]}</td>
                  <td className="py-2 text-right font-display text-purple-200">{row[1]}</td>
                  <td className="py-2 text-right font-display text-amber-200">{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-500">{p.earnNote}</p>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
          <Trophy className="h-4 w-4 text-amber-300" /> {p.achievementsTitle}
        </h2>
        {!me && (
          <p className="mb-3 text-sm text-zinc-400">
            <Link href="/login?next=/ranks" className="text-purple-300 hover:text-purple-200">
              {p.signInToTrack}
            </Link>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BADGES.map((b) => {
            const text = BADGE_TEXT[locale][b.slug];
            const done = unlocked.has(b.slug);
            const cur = Math.min(progressOf(b.ruleType), b.threshold);
            return (
              <div key={b.id} className={cn("rounded-2xl border border-white/10 bg-white/[0.02] p-3", !done && me && "opacity-80")}>
                <BadgePill name={text?.name ?? b.name} description={text?.description ?? b.description} icon={b.icon} color={b.color} />
                <p className="mt-2 text-xs text-zinc-400">{text?.description ?? b.description}</p>
                {me && (
                  <div className="mt-2">
                    <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                      <span>{done ? p.unlocked : p.achievementProgress(cur, b.threshold)}</span>
                      <span className="text-amber-200">+50 {t.progression.coinsShort}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full" style={{ width: `${done ? 100 : Math.round((cur / b.threshold) * 100)}%`, background: b.color }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
