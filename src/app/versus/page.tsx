import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { getLadder, getPlayerGameSummaries, getRecentMatches } from "@/server/platform/queries";
import { activeMatchOf } from "@/server/versus/service";
import { LeagueBadge } from "@/components/platform/LeagueBadge";
import { RecentMatches } from "@/components/platform/RecentMatches";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/primitives";
import { VersusHub } from "@/components/versus/VersusHub";
import { VERSUS_TEXT } from "@/components/versus/texts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerTranslations();
  return { title: VERSUS_TEXT[locale].title };
}

export default async function VersusPage({ searchParams }: { searchParams: Promise<{ auto?: string }> }) {
  const [{ locale, t: tAll }, user, ladder, sp] = await Promise.all([getServerTranslations(), getCurrentUser(), getLadder("VERSUS", 10), searchParams]);
  const t = VERSUS_TEXT[locale];
  const [summaries, recent, active] = await Promise.all([
    user ? getPlayerGameSummaries(user.id) : Promise.resolve([]),
    user ? getRecentMatches(user.id, 30) : Promise.resolve([]),
    user ? activeMatchOf(user.id) : Promise.resolve(null),
  ]);
  const mine = summaries.find((s) => s.game === "VERSUS")?.season ?? null;
  const myRecent = recent.filter((m) => m.game === "VERSUS").slice(0, 6);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.eyebrow}
        title={
          <>
            {t.headingStart} <span className="text-gradient">{t.headingAccent}</span>
          </>
        }
        description={t.description}
      />

      <VersusHub
        signedIn={!!user}
        activeCode={active}
        autoRanked={sp.auto === "ranked"}
        rating={
          mine ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-2xl font-bold text-white" data-testid="versus-rating">
                {mine.rating}
              </span>
              <LeagueBadge rating={mine.rating} locale={locale} />
              <span className="text-xs text-zinc-400">{tAll.games.record(mine.wins, mine.losses, mine.draws)}</span>
            </div>
          ) : (
            <span className="text-sm text-zinc-400">{t.noRating}</span>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className="glass rounded-3xl p-5 md:p-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
            <BookOpen className="h-4 w-4 text-cyan-300" /> {t.howTo}
          </h2>
          <ol className="space-y-2 text-sm leading-relaxed text-zinc-300">
            {t.rules.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 font-display text-[11px] font-bold text-cyan-200">
                  {i + 1}
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {(["TANK", "BLITZ", "POWER", "TACTIC"] as const).map((a) => (
              <div key={a} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="font-display text-sm font-bold text-white">{t.archetypes[a]}</div>
                <div className="mt-1 text-xs text-zinc-400">{t.archetypeDesc[a]}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-5">
          <section className="glass rounded-3xl p-5 md:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
                <Trophy className="h-4 w-4 text-amber-300" /> {t.ladder}
              </h2>
              <Link href="/leaderboard?game=VERSUS" className="text-xs text-purple-200 hover:text-white">
                {t.fullLadder}
              </Link>
            </div>
            {ladder.rows.length === 0 ? (
              <p className="text-sm text-zinc-500">{t.ladderEmpty}</p>
            ) : (
              <ol className="space-y-1.5">
                {ladder.rows.map((r, idx) => (
                  <li key={r.userId} className="flex items-center gap-2 text-sm">
                    <span className="w-5 font-display text-xs text-zinc-500">{idx + 1}</span>
                    <Avatar username={r.username} style={r.avatarStyle} imageUrl={r.avatarImage} size={24} />
                    <Link href={`/profile/${r.username}`} className="min-w-0 truncate text-zinc-200 hover:text-white">
                      {r.username}
                    </Link>
                    <span className="ml-auto hidden sm:inline">
                      <LeagueBadge rating={r.rating} locale={locale} />
                    </span>
                    <span className="w-12 text-right font-display font-bold text-white">{r.rating}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {user && (
            <section className="glass rounded-3xl p-5 md:p-6">
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.recent}</h2>
              <RecentMatches matches={myRecent} locale={locale} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
