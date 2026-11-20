import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarDays, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { getLadder, getPlayerGameSummaries } from "@/server/platform/queries";
import { getDailyBoard, getGuessStats, getOpenSoloRun, getTodayRun } from "@/server/guess/solo";
import { activeRoomOf } from "@/server/guess/race";
import { LeagueBadge } from "@/components/platform/LeagueBadge";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/primitives";
import { GuessHub } from "@/components/guess/GuessHub";
import { GUESS_TEXT } from "@/components/guess/texts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerTranslations();
  return { title: GUESS_TEXT[locale].title };
}

export default async function GuessPage({ searchParams }: { searchParams: Promise<{ auto?: string }> }) {
  const [{ locale, t: tAll }, user, ladder, board, sp] = await Promise.all([
    getServerTranslations(),
    getCurrentUser(),
    getLadder("GUESS", 10),
    getDailyBoard(10),
    searchParams,
  ]);
  const t = GUESS_TEXT[locale];
  const [stats, today, openRun, room, summaries] = await Promise.all([
    user ? getGuessStats(user.id) : Promise.resolve(null),
    user ? getTodayRun(user.id) : Promise.resolve(null),
    user ? getOpenSoloRun(user.id) : Promise.resolve(null),
    user ? activeRoomOf(user.id) : Promise.resolve(null),
    user ? getPlayerGameSummaries(user.id) : Promise.resolve([]),
  ]);
  const season = summaries.find((s) => s.game === "GUESS")?.season ?? null;
  const accuracy = stats && stats.roundsPlayed > 0 ? Math.round((stats.roundsCorrect / stats.roundsPlayed) * 100) : null;

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

      <GuessHub
        signedIn={!!user}
        daily={today}
        dailyStreak={stats?.dailyStreak ?? 0}
        openRun={openRun}
        activeRoom={room}
        autoRanked={sp.auto === "ranked"}
        rating={
          season ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-2xl font-bold text-white" data-testid="guess-rating">
                {season.rating}
              </span>
              <LeagueBadge rating={season.rating} locale={locale} />
              <span className="text-xs text-zinc-400">{tAll.games.record(season.wins, season.losses, season.draws)}</span>
            </div>
          ) : (
            <span className="text-sm text-zinc-400">{t.noRating}</span>
          )
        }
      />

      {stats && (
        <section className="glass rounded-3xl p-5" data-testid="guess-stats">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.myStats}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              [t.statRuns, stats.runs],
              [t.statAccuracy, accuracy === null ? "—" : `%${accuracy}`],
              [t.statBestScore, stats.bestScore],
              [t.statBestStreak, stats.bestStreak],
              [t.statDailyStreak, stats.dailyStreak],
              [t.statBestDaily, stats.bestDailyStreak],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] uppercase tracking-widest text-zinc-500">{label}</div>
                <div className="mt-1 font-display text-2xl font-bold text-white">{value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="glass rounded-3xl p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
            <CalendarDays className="h-4 w-4 text-lime-300" /> {t.todayBoard}
          </h2>
          {board.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.todayEmpty}</p>
          ) : (
            <ol className="space-y-1.5" data-testid="guess-daily-board">
              {board.map((r, i) => (
                <li key={r.userId} className="flex items-center gap-2 text-sm">
                  <span className="w-5 font-display text-xs text-zinc-500">{i + 1}</span>
                  <Avatar username={r.username} style={r.avatarStyle} imageUrl={r.avatarImage} size={24} />
                  <Link href={`/profile/${r.username}`} className="min-w-0 truncate text-zinc-200 hover:text-white">
                    {r.username}
                  </Link>
                  <span className="ml-auto text-xs text-zinc-500">
                    {r.correct}/{r.rounds}
                  </span>
                  <span className="w-12 text-right font-display font-bold text-white">{r.score}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="glass rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
              <Trophy className="h-4 w-4 text-amber-300" /> {t.ladder}
            </h2>
            <Link href="/leaderboard?game=GUESS" className="text-xs text-purple-200 hover:text-white">
              {t.fullLadder}
            </Link>
          </div>
          {ladder.rows.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.ladderEmpty}</p>
          ) : (
            <ol className="space-y-1.5">
              {ladder.rows.map((r, i) => (
                <li key={r.userId} className="flex items-center gap-2 text-sm">
                  <span className="w-5 font-display text-xs text-zinc-500">{i + 1}</span>
                  <Avatar username={r.username} style={r.avatarStyle} imageUrl={r.avatarImage} size={24} />
                  <Link href={`/profile/${r.username}`} className="min-w-0 truncate text-zinc-200 hover:text-white">
                    {r.username}
                  </Link>
                  <span className="ml-auto w-12 text-right font-display font-bold text-white">{r.rating}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="glass rounded-3xl p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
            <BookOpen className="h-4 w-4 text-lime-300" /> {t.howTo}
          </h2>
          <ol className="space-y-2 text-sm leading-relaxed text-zinc-300">
            {t.rules.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime-400/15 font-display text-[11px] font-bold text-lime-200">{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
