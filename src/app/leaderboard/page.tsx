import type { Metadata } from "next";
import Link from "next/link";
import { Crown, Medal, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { getPlayerStats, winRate, type PlayerStatsRow } from "@/lib/stats";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { RankBadge } from "@/components/progression/RankBadge";
import { LeagueBadge } from "@/components/platform/LeagueBadge";
import { GAMES, gameInfo, isGameKey, type GameKey } from "@/game/platform";
import { getLadder } from "@/server/platform/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.leaderboard.title };
}

function LadderTabs({ active, t, locale }: { active: string; t: Awaited<ReturnType<typeof getServerTranslations>>["t"]; locale: "tr" | "en" }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2" data-testid="ladder-tabs">
      <Link href="/leaderboard" className="chip !px-4 !py-2" data-active={active === "OVERALL"}>
        {t.games.general}
      </Link>
      {GAMES.map((g) => (
        <Link key={g.key} href={`/leaderboard?game=${g.key}`} className="chip !px-4 !py-2" data-active={active === g.key}>
          {g.name[locale]}
        </Link>
      ))}
    </div>
  );
}

async function GameLadder({ game, locale, t, meId }: { game: GameKey; locale: "tr" | "en"; t: Awaited<ReturnType<typeof getServerTranslations>>["t"]; meId: string | null }) {
  const { season, rows } = await getLadder(game, 100);
  const info = gameInfo(game)!;
  return (
    <>
      <PageHeader
        eyebrow={`${t.leaderboard.eyebrow} · ${season.name}`}
        title={
          <>
            {info.name[locale]} <span className="text-gradient">{t.games.ladderTitle}</span>
          </>
        }
        description={t.games.howRating}
      />
      <LadderTabs active={game} t={t} locale={locale} />
      {rows.length === 0 ? (
        <EmptyState icon={Trophy} title={t.games.ladderEmpty} description={info.tagline[locale]} action={{ href: info.href, label: t.games.play }} />
      ) : (
        <div className="glass overflow-x-auto rounded-3xl" data-testid="game-ladder">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-zinc-500">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">{t.games.player}</th>
                <th className="px-4 py-3 text-right">{t.games.rating}</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">{t.games.peak}</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">{t.games.played}</th>
                <th className="hidden px-4 py-3 text-right md:table-cell">{t.games.winRate}</th>
                <th className="hidden px-4 py-3 text-right md:table-cell">{t.games.bestStreak}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r, i) => (
                <tr key={r.userId} className={cn(r.userId === meId && "bg-purple-500/10")}>
                  <td className="px-4 py-3 font-display text-zinc-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/profile/${r.username}`} className="flex items-center gap-2 text-white hover:text-purple-200">
                      <Avatar username={r.username} style={r.avatarStyle} imageUrl={r.avatarImage} size={28} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold">{r.username}</span>
                          <LeagueBadge rating={r.rating} locale={locale} />
                        </span>
                        <span className="block text-xs text-zinc-500 sm:hidden">{t.games.record(r.wins, r.losses, r.draws)}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-display text-lg font-bold text-white">{r.rating}</td>
                  <td className="hidden px-4 py-3 text-right text-zinc-400 sm:table-cell">{r.peak}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right text-zinc-300 sm:table-cell">{t.games.record(r.wins, r.losses, r.draws)}</td>
                  <td className="hidden px-4 py-3 text-right text-zinc-300 md:table-cell">{r.played ? `${Math.round((r.wins / r.played) * 100)}%` : "—"}</td>
                  <td className="hidden px-4 py-3 text-right text-zinc-300 md:table-cell">{r.bestStreak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ sort?: string; game?: string }> }) {
  const params = await searchParams;
  if (isGameKey(params.game)) {
    const [{ locale, t }, viewer] = await Promise.all([getServerTranslations(), getCurrentUser()]);
    return <GameLadder game={params.game} locale={locale} t={t} meId={viewer?.id ?? null} />;
  }
  const [{ sort: rawSort }, { locale, t }, me, allRows] = await Promise.all([
    searchParams,
    getServerTranslations(),
    getCurrentUser(),
    getPlayerStats(),
  ]);

  const SORTS = {
    xp: { label: t.leaderboard.sorts.xp, value: (r: PlayerStatsRow) => r.xp, fmt: (r: PlayerStatsRow) => `${r.xp} XP` },
    score: { label: t.leaderboard.sorts.score, value: (r: PlayerStatsRow) => r.collectionScore, fmt: (r: PlayerStatsRow) => `${r.collectionScore}` },
    debates: { label: t.leaderboard.sorts.debates, value: (r: PlayerStatsRow) => r.likesReceived, fmt: (r: PlayerStatsRow) => `${r.likesReceived}` },
    wins: { label: t.leaderboard.sorts.wins, value: (r: PlayerStatsRow) => r.auctionWins, fmt: (r: PlayerStatsRow) => `${r.auctionWins}` },
    winrate: {
      label: t.leaderboard.sorts.winrate,
      value: (r: PlayerStatsRow) => (r.auctionWins + r.auctionLosses >= 3 ? winRate(r.auctionWins, r.auctionLosses) ?? 0 : -1),
      fmt: (r: PlayerStatsRow) => {
        const w = winRate(r.auctionWins, r.auctionLosses);
        return w === null ? "—" : `${Math.round(w * 100)}%`;
      },
    },
    characters: { label: t.leaderboard.sorts.characters, value: (r: PlayerStatsRow) => r.characters, fmt: (r: PlayerStatsRow) => `${r.characters}` },
    matches: { label: t.leaderboard.sorts.matches, value: (r: PlayerStatsRow) => r.matchesWon, fmt: (r: PlayerStatsRow) => `${r.matchesWon}` },
  } as const;

  type SortKey = keyof typeof SORTS;
  const sort: SortKey = rawSort && rawSort in SORTS ? (rawSort as SortKey) : "xp";
  const def = SORTS[sort];
  const rows = allRows
    .filter((r) => def.value(r) >= 0)
    .sort((a, b) => def.value(b) - def.value(a) || b.xp - a.xp || a.username.localeCompare(b.username))
    .slice(0, 50);
  const podium = rows.slice(0, 3);

  return (
    <>
      <PageHeader
        eyebrow={t.leaderboard.eyebrow}
        title={
          <>
            {t.leaderboard.headingStart} <span className="text-gradient">{t.leaderboard.headingAccent}</span>
          </>
        }
        description={t.leaderboard.description}
      />
      <LadderTabs active="OVERALL" t={t} locale={locale} />
      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(SORTS) as SortKey[]).map((k) => (
          <Link key={k} href={`/leaderboard?sort=${k}`} className="chip" data-active={k === sort}>
            {SORTS[k].label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={t.leaderboard.emptyTitle}
          description={t.leaderboard.emptyDesc}
          action={{ href: "/debates", label: t.leaderboard.exploreDebates }}
        />
      ) : (
        <>
          <div className="mb-8 grid gap-4 md:grid-cols-3">
            {podium.map((r, i) => (
              <Link
                key={r.id}
                href={`/profile/${r.username}`}
                className={cn(
                  "glass relative flex flex-col items-center overflow-hidden rounded-3xl p-6 text-center transition hover:-translate-y-1 animate-slide-up",
                  i === 0 && "neon-border md:order-2 md:-mt-4",
                  i === 1 && "md:order-1",
                  i === 2 && "md:order-3",
                )}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute -top-16 h-40 w-40 rounded-full blur-3xl",
                    i === 0 ? "bg-amber-500/30" : i === 1 ? "bg-zinc-300/20" : "bg-orange-700/25",
                  )}
                />
                {i === 0 ? <Crown className="relative h-7 w-7 text-amber-300" /> : <Medal className={cn("relative h-6 w-6", i === 1 ? "text-zinc-300" : "text-orange-400")} />}
                <Avatar username={r.username} style={r.avatarStyle} imageUrl={r.avatarImage} size={i === 0 ? 84 : 68} ring={i === 0 ? "purple" : "none"} className="relative mt-3" />
                <div className="relative mt-3 flex items-center gap-2 font-display text-lg font-bold text-white">
                  {r.username}
                  <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-200">
                    {t.nav.levelShort}.{r.level}
                  </span>
                </div>
                <RankBadge level={r.level} locale={locale} size="xs" className="relative mt-1" />
                <div className="relative mt-1 font-display text-3xl font-black text-gradient">{def.fmt(r)}</div>
                <div className="relative text-xs uppercase tracking-widest text-zinc-500">{def.label}</div>
              </Link>
            ))}
          </div>

          <div className="glass overflow-hidden rounded-3xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-widest text-zinc-500">
                    <th className="px-5 py-3">#</th>
                    <th className="px-5 py-3">{t.leaderboard.colPlayer}</th>
                    <th className="px-5 py-3 text-right">{t.leaderboard.colLevelXp}</th>
                    <th className="px-5 py-3 text-right">{t.leaderboard.colDebatesVs}</th>
                    <th className="px-5 py-3 text-right">{t.leaderboard.colLikes}</th>
                    <th className="px-5 py-3 text-right">{t.leaderboard.colScore}</th>
                    <th className="px-5 py-3 text-right">{t.leaderboard.colAuctionWL}</th>
                    <th className="px-5 py-3 text-right">{t.leaderboard.colWinRate}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const wr = winRate(r.auctionWins, r.auctionLosses);
                    return (
                      <tr
                        key={r.id}
                        className={cn("border-b border-white/[0.03] transition hover:bg-white/[0.03]", me?.id === r.id && "bg-purple-500/10")}
                      >
                        <td className="px-5 py-3 font-display font-bold text-zinc-400">{i + 1}</td>
                        <td className="px-5 py-3">
                          <Link href={`/profile/${r.username}`} className="flex items-center gap-3 hover:text-white">
                            <Avatar username={r.username} style={r.avatarStyle} imageUrl={r.avatarImage} size={32} />
                            <span className="font-medium text-zinc-100">{r.username}</span>
                            {me?.id === r.id && (
                              <span className="rounded bg-purple-500/30 px-1.5 text-[10px] uppercase text-purple-100">{t.leaderboard.youBadge}</span>
                            )}
                          </Link>
                        </td>
                        <td className={cn("px-5 py-3 text-right font-display font-semibold", sort === "xp" ? "text-purple-200" : "text-zinc-200")}>
                          {t.nav.levelShort}.{r.level} <span className="text-xs text-zinc-500">({r.xp})</span>{" "}
                          <RankBadge level={r.level} locale={locale} size="xs" />
                        </td>
                        <td className="px-5 py-3 text-right text-zinc-300">{r.debatesCount + r.comparisonsCount}</td>
                        <td className={cn("px-5 py-3 text-right", sort === "debates" && "text-purple-200")}>{r.likesReceived}</td>
                        <td className={cn("px-5 py-3 text-right font-display font-semibold", sort === "score" ? "text-purple-200" : "text-zinc-200")}>
                          {r.collectionScore}
                        </td>
                        <td className={cn("px-5 py-3 text-right", sort === "wins" && "text-purple-200")}>
                          {r.auctionWins} / {r.auctionLosses}
                        </td>
                        <td className={cn("px-5 py-3 text-right", sort === "winrate" && "text-purple-200")}>{wr === null ? "—" : `${Math.round(wr * 100)}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {sort === "winrate" && <p className="mt-3 text-xs text-zinc-500">{t.leaderboard.winRateNote}</p>}
        </>
      )}
    </>
  );
}
