import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Gamepad2, Gavel, Layers, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { GAMES } from "@/game/platform";
import { currentSeason } from "@/server/platform/results";
import { getLadder, getPlayerGameSummaries, getRecentMatches, getSeasonActivity } from "@/server/platform/queries";
import { LeagueBadge } from "@/components/platform/LeagueBadge";
import { RecentMatches } from "@/components/platform/RecentMatches";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.games.title };
}

const ICONS = { AUCTION: Gavel, CARD_DUEL: Layers } as const;

export default async function GamesPage() {
  const [{ locale, t }, user, season, activity] = await Promise.all([
    getServerTranslations(),
    getCurrentUser(),
    currentSeason(),
    getSeasonActivity(),
  ]);
  const g = t.games;
  const [summaries, recent, ladders] = await Promise.all([
    user ? getPlayerGameSummaries(user.id) : Promise.resolve([]),
    user ? getRecentMatches(user.id, 8) : Promise.resolve([]),
    Promise.all(GAMES.map((game) => getLadder(game.key, 3))),
  ]);
  const endDate = new Date(season.endsAt.getTime() - 1).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={g.eyebrow}
        title={
          <>
            {g.headingStart} <span className="text-gradient">{g.headingAccent}</span>
          </>
        }
        description={g.description}
      />

      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm text-zinc-300" data-testid="season-banner">
        <CalendarClock className="h-4 w-4 text-purple-300" />
        <span className="font-semibold text-white">{g.seasonLine(season.name, endDate)}</span>
        <span className="text-xs text-zinc-500">{g.howRating}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {GAMES.map((game, i) => {
          const Icon = ICONS[game.key] ?? Gamepad2;
          const mine = summaries.find((s) => s.game === game.key);
          const top = ladders[i].rows;
          return (
            <section
              key={game.key}
              className="glass-strong relative flex flex-col overflow-hidden rounded-3xl p-6"
              style={{ borderColor: `${game.color}55` }}
              data-testid={`game-card-${game.key}`}
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl" style={{ background: `${game.color}33` }} />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <Icon className="h-8 w-8" style={{ color: game.color }} />
                  <h2 className="mt-3 font-display text-2xl font-bold text-white">{game.name[locale]}</h2>
                  <p className="text-sm font-medium" style={{ color: game.color }}>
                    {game.tagline[locale]}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-zinc-500">{g.matchesThisSeason(activity[game.key] ?? 0)}</span>
              </div>
              <p className="relative mt-3 text-sm leading-relaxed text-zinc-300">{game.description[locale]}</p>
              <div className="relative mt-3 flex flex-wrap gap-1.5">
                {game.modes[locale].map((m) => (
                  <span key={m} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200">
                    {m}
                  </span>
                ))}
              </div>

              {user && (
                <div className="relative mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[11px] uppercase tracking-widest text-zinc-500">{g.yourRating}</div>
                  {mine?.season ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-display text-2xl font-bold text-white">{mine.season.rating}</span>
                      <LeagueBadge rating={mine.season.rating} locale={locale} />
                      <span className="text-xs text-zinc-400">{g.record(mine.season.wins, mine.season.losses, mine.season.draws)}</span>
                      {mine.season.position && <span className="text-xs text-purple-200">{g.position(mine.season.position)}</span>}
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-zinc-400">{g.noRating}</div>
                  )}
                </div>
              )}

              {top.length > 0 && (
                <div className="relative mt-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-500">
                    <Trophy className="h-3.5 w-3.5 text-amber-300" /> {g.ladderTitle}
                  </div>
                  <ol className="space-y-1.5">
                    {top.map((r, idx) => (
                      <li key={r.userId} className="flex items-center gap-2 text-sm">
                        <span className="w-4 font-display text-xs text-zinc-500">{idx + 1}</span>
                        <Avatar username={r.username} style={r.avatarStyle} imageUrl={r.avatarImage} size={22} />
                        <Link href={`/profile/${r.username}`} className="truncate text-zinc-200 hover:text-white">
                          {r.username}
                        </Link>
                        <span className="ml-auto font-display font-bold text-white">{r.rating}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="relative mt-auto flex flex-wrap gap-2 pt-5">
                <Link href={game.href} className="btn btn-primary flex-1" data-testid={`play-${game.key}`}>
                  {g.play}
                </Link>
                <Link href={`/leaderboard?game=${game.key}`} className="btn btn-ghost">
                  {g.ladderLink}
                </Link>
              </div>
            </section>
          );
        })}
      </div>

      {user && (
        <section className="glass rounded-3xl p-6">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{g.recentTitle}</h2>
          <RecentMatches matches={recent} locale={locale} />
        </section>
      )}
    </div>
  );
}
