import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { getAnime } from "@/data/anime";
import { Avatar } from "@/components/ui/Avatar";
import { CharacterArt } from "@/components/character/CharacterArt";
import { RarityBadge } from "@/components/character/badges";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Match report" };

const REASONS: Record<string, string> = {
  COMPLETED: "All lots were auctioned.",
  POOL_EXHAUSTED: "No affordable characters were left.",
  FORFEIT: "A player forfeited or failed to reconnect.",
  ABANDONED: "Both players left before the end.",
};

export default async function MatchReportPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      players: {
        orderBy: { seat: "asc" },
        include: { user: { select: { id: true, username: true, avatarStyle: true, avatarCharacter: { select: { imageUrl: true } } } } },
      },
      lots: {
        orderBy: { lotNumber: "asc" },
        include: {
          character: true,
          bids: { orderBy: { createdAt: "asc" }, include: { user: { select: { username: true } } } },
        },
      },
    },
  });
  if (!match) notFound();
  const viewer = await getCurrentUser();
  const colorOf = (userId: string | null) =>
    userId === match.players[0]?.userId ? "text-purple-200" : userId === match.players[1]?.userId ? "text-rose-200" : "text-zinc-400";

  return (
    <div className="space-y-6">
      <Link href="/history" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Auction history
      </Link>

      <div className="glass-strong relative overflow-hidden rounded-3xl p-6 md:p-8 neon-border animate-slide-up">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-purple-600/30 blur-3xl" />
        <div className="relative">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-purple-300/80">
            Match report · Room {match.code}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-white md:text-4xl">
            {match.status === "IN_PROGRESS" || match.status === "WAITING"
              ? "Match in progress"
              : match.winnerId
                ? `${match.players.find((p) => p.userId === match.winnerId)?.user.username ?? "Unknown"} won`
                : match.status === "ABANDONED"
                  ? "Match abandoned"
                  : "Draw"}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {match.endReason ? REASONS[match.endReason] ?? match.endReason : "Still running."} · {match.totalLots} lots · {match.bidSeconds}s timer ·{" "}
            {match.animeIds.map((id) => getAnime(id)?.shortName ?? id).join(", ")}
            {match.endedAt ? ` · ${match.endedAt.toLocaleString()}` : ""}
          </p>
          {(match.status === "IN_PROGRESS" || match.status === "WAITING") && (
            <Link href={`/room/${match.code}`} className="btn btn-primary mt-4">
              Open live room
            </Link>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {match.players.map((p, i) => (
              <div key={p.id} className={cn("flex items-center gap-3 rounded-2xl border bg-black/20 p-4", i === 0 ? "border-purple-500/30" : "border-rose-500/30")}>
                <Avatar username={p.user.username} style={p.user.avatarStyle} imageUrl={p.user.avatarCharacter?.imageUrl} size={44} ring={i === 0 ? "purple" : "red"} />
                <div className="flex-1">
                  <Link href={`/profile/${p.user.username}`} className="flex items-center gap-2 font-display font-semibold text-white hover:underline">
                    {p.user.username}
                    {match.winnerId === p.userId && <Trophy className="h-4 w-4 text-amber-300" />}
                    {viewer?.id === p.userId && <span className="text-xs font-normal text-zinc-500">(you)</span>}
                  </Link>
                  <div className="text-xs text-zinc-400">
                    {p.result ?? "—"} · ${p.balance} left of ${match.startingBalance}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">Score</div>
                  <div className={cn("font-display text-2xl font-bold", i === 0 ? "text-purple-200" : "text-rose-200")}>{p.score}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {match.lots.length === 0 && <div className="glass rounded-2xl p-8 text-center text-sm text-zinc-400">No lots were auctioned in this match.</div>}
        {match.lots.map((lot) => {
          const winner = match.players.find((p) => p.userId === lot.winnerId);
          return (
            <div key={lot.id} className="glass flex flex-col gap-4 rounded-2xl p-4 md:flex-row">
              <div className="flex items-center gap-4 md:w-80">
                <Link href={`/characters/${lot.characterId}`} className="h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10">
                  <CharacterArt name={lot.character.name} animeId={lot.character.animeId} imageUrl={lot.character.imageUrl} />
                </Link>
                <div>
                  <div className="text-xs text-zinc-500">Lot #{lot.lotNumber}</div>
                  <div className="font-display font-semibold text-white">{lot.character.name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <RarityBadge rarity={lot.character.rarity} />
                    <span className="text-xs text-zinc-500">opens ${lot.startingPrice}</span>
                  </div>
                </div>
              </div>
              <div className="flex-1">
                {lot.bids.length === 0 ? (
                  <p className="text-sm text-zinc-500">No bids.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {lot.bids.map((b) => (
                      <span key={b.id} className={cn("rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs", colorOf(b.userId))}>
                        {b.user.username} ${b.amount}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right md:w-40">
                {lot.status === "SOLD" ? (
                  <>
                    <div className="font-display text-xl font-bold text-white">${lot.finalPrice}</div>
                    <div className={cn("text-sm", colorOf(lot.winnerId))}>{winner?.user.username ?? "—"}</div>
                  </>
                ) : (
                  <div className="font-display text-sm uppercase tracking-widest text-zinc-500">{lot.status === "UNSOLD" ? "Unsold" : lot.status === "CANCELLED" ? "Cancelled" : "Live"}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
