import type { Metadata } from "next";
import Link from "next/link";
import { Crown, Medal, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/server";
import { getPlayerStats, winRate, type PlayerStatsRow } from "@/lib/stats";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

const SORTS = {
  score: { label: "Collection score", value: (r: PlayerStatsRow) => r.collectionScore, fmt: (r: PlayerStatsRow) => `${r.collectionScore}` },
  wins: { label: "Auction wins", value: (r: PlayerStatsRow) => r.auctionWins, fmt: (r: PlayerStatsRow) => `${r.auctionWins}` },
  winrate: {
    label: "Win rate",
    value: (r: PlayerStatsRow) => (r.auctionWins + r.auctionLosses >= 3 ? winRate(r.auctionWins, r.auctionLosses) ?? 0 : -1),
    fmt: (r: PlayerStatsRow) => {
      const w = winRate(r.auctionWins, r.auctionLosses);
      return w === null ? "—" : `${Math.round(w * 100)}%`;
    },
  },
  characters: { label: "Characters", value: (r: PlayerStatsRow) => r.characters, fmt: (r: PlayerStatsRow) => `${r.characters}` },
  matches: { label: "Matches won", value: (r: PlayerStatsRow) => r.matchesWon, fmt: (r: PlayerStatsRow) => `${r.matchesWon}` },
} as const;

type SortKey = keyof typeof SORTS;

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort: rawSort } = await searchParams;
  const sort: SortKey = rawSort && rawSort in SORTS ? (rawSort as SortKey) : "score";
  const me = await getCurrentUser();
  const def = SORTS[sort];
  const rows = (await getPlayerStats())
    .filter((r) => def.value(r) >= 0)
    .sort((a, b) => def.value(b) - def.value(a) || b.collectionScore - a.collectionScore || a.username.localeCompare(b.username))
    .slice(0, 50);
  const podium = rows.slice(0, 3);

  return (
    <>
      <PageHeader
        eyebrow="Leaderboard"
        title={<>Top <span className="text-gradient">collectors</span></>}
        description="Rankings update after every auction. Collection score adds up rarity points: Common 1 · Rare 2 · Epic 3 · Legendary 5 · Mythic 8."
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(SORTS) as SortKey[]).map((k) => (
          <Link key={k} href={`/leaderboard?sort=${k}`} className="chip" data-active={k === sort}>
            {SORTS[k].label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No rankings yet" description="Finish an auction to put your name on the board." action={{ href: "/play", label: "Play now" }} />
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
                <div className="relative mt-3 font-display text-lg font-bold text-white">{r.username}</div>
                <div className="relative mt-1 font-display text-3xl font-black text-gradient">{def.fmt(r)}</div>
                <div className="relative text-xs uppercase tracking-widest text-zinc-500">{def.label}</div>
              </Link>
            ))}
          </div>

          <div className="glass overflow-hidden rounded-3xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-widest text-zinc-500">
                    <th className="px-5 py-3">#</th>
                    <th className="px-5 py-3">Player</th>
                    <th className="px-5 py-3 text-right">Score</th>
                    <th className="px-5 py-3 text-right">Characters</th>
                    <th className="px-5 py-3 text-right">Auction W/L</th>
                    <th className="px-5 py-3 text-right">Win rate</th>
                    <th className="px-5 py-3 text-right">Matches won</th>
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
                            {me?.id === r.id && <span className="rounded bg-purple-500/30 px-1.5 text-[10px] uppercase text-purple-100">You</span>}
                          </Link>
                        </td>
                        <td className={cn("px-5 py-3 text-right font-display font-semibold", sort === "score" ? "text-purple-200" : "text-zinc-200")}>
                          {r.collectionScore}
                        </td>
                        <td className={cn("px-5 py-3 text-right", sort === "characters" && "text-purple-200")}>{r.characters}</td>
                        <td className={cn("px-5 py-3 text-right", sort === "wins" && "text-purple-200")}>
                          {r.auctionWins} / {r.auctionLosses}
                        </td>
                        <td className={cn("px-5 py-3 text-right", sort === "winrate" && "text-purple-200")}>{wr === null ? "—" : `${Math.round(wr * 100)}%`}</td>
                        <td className={cn("px-5 py-3 text-right", sort === "matches" && "text-purple-200")}>
                          {r.matchesWon} <span className="text-zinc-500">/ {r.matchesPlayed}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {sort === "winrate" && <p className="mt-3 text-xs text-zinc-500">Win rate ranking requires at least 3 contested auctions.</p>}
        </>
      )}
    </>
  );
}
