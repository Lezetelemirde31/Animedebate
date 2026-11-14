import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History, Radio } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { Avatar } from "@/components/ui/Avatar";
import { CharacterArt } from "@/components/character/CharacterArt";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { RARITY_INFO } from "@/game/rarity";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Auction history" };

const PAGE_SIZE = 10;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser("/history");
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const where = { userId: user.id, match: { status: { in: ["FINISHED", "ABANDONED", "IN_PROGRESS"] as ("FINISHED" | "ABANDONED" | "IN_PROGRESS")[] } } };
  const [total, entries] = await Promise.all([
    prisma.matchPlayer.count({ where }),
    prisma.matchPlayer.findMany({
      where,
      orderBy: { joinedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        match: {
          include: {
            players: { include: { user: { select: { username: true, avatarStyle: true, avatarCharacter: { select: { imageUrl: true } } } } } },
            lots: {
              where: { status: "SOLD", winnerId: user.id },
              orderBy: { lotNumber: "asc" },
              include: { character: { select: { id: true, name: true, animeId: true, imageUrl: true, rarity: true } } },
            },
            _count: { select: { lots: true } },
          },
        },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Auction history"
        title={<>Every <span className="text-gradient">gavel</span> you heard</>}
        description="Your matches, what you won and what you paid. Open a match for the full lot-by-lot bid record."
      />
      {entries.length === 0 ? (
        <EmptyState icon={History} title="No auctions yet" description="Your finished matches will be listed here." action={{ href: "/play", label: "Start your first auction" }} />
      ) : (
        <div className="space-y-3">
          {entries.map((mp) => {
            const m = mp.match;
            const opp = m.players.find((p) => p.userId !== user.id);
            const live = m.status === "IN_PROGRESS";
            const label = live ? "Live" : m.status === "ABANDONED" ? "Abandoned" : mp.result === "WIN" ? "Victory" : mp.result === "LOSS" ? "Defeat" : "Draw";
            return (
              <Link
                key={mp.id}
                href={live ? `/room/${m.code}` : `/history/${m.id}`}
                className="glass flex flex-col gap-4 rounded-2xl p-4 transition hover:border-purple-500/30 md:flex-row md:items-center animate-slide-up"
              >
                <div className="flex items-center gap-4 md:w-72">
                  <span
                    className={cn(
                      "flex w-24 items-center justify-center gap-1 rounded-full px-2 py-1 font-display text-xs font-bold uppercase tracking-wider",
                      live
                        ? "bg-rose-500/15 text-rose-300"
                        : mp.result === "WIN"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : mp.result === "LOSS"
                            ? "bg-rose-500/15 text-rose-300"
                            : "bg-white/5 text-zinc-400",
                    )}
                  >
                    {live && <Radio className="h-3 w-3 animate-pulse" />}
                    {label}
                  </span>
                  <div className="flex items-center gap-2">
                    {opp ? (
                      <>
                        <Avatar username={opp.user.username} style={opp.user.avatarStyle} imageUrl={opp.user.avatarCharacter?.imageUrl} size={30} />
                        <span className="text-sm text-zinc-200">vs {opp.user.username}</span>
                      </>
                    ) : (
                      <span className="text-sm text-zinc-500">No opponent</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
                  {m.lots.length === 0 ? (
                    <span className="text-sm text-zinc-500">No characters won</span>
                  ) : (
                    m.lots.map((l) => (
                      <div
                        key={l.id}
                        className="h-12 w-10 shrink-0 overflow-hidden rounded-md border"
                        style={{ borderColor: RARITY_INFO[l.character.rarity].color }}
                        title={`${l.character.name} · $${l.finalPrice}`}
                      >
                        <CharacterArt name={l.character.name} animeId={l.character.animeId} imageUrl={l.character.imageUrl} />
                      </div>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm md:w-64 md:justify-end">
                  <div className="text-right">
                    <div className="font-display font-semibold text-white">{mp.score} pts</div>
                    <div className="text-xs text-zinc-500">${m.startingBalance - mp.balance} spent</div>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <div>{m._count.lots} lots</div>
                    <div>{timeAgo(m.endedAt ?? m.createdAt)}</div>
                  </div>
                </div>
              </Link>
            );
          })}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Link
                href={`/history?page=${page - 1}`}
                className={cn("btn btn-ghost !py-2", page <= 1 && "pointer-events-none opacity-40")}
                aria-disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" /> Newer
              </Link>
              <span className="text-sm text-zinc-400">
                Page {page} of {pages}
              </span>
              <Link
                href={`/history?page=${page + 1}`}
                className={cn("btn btn-ghost !py-2", page >= pages && "pointer-events-none opacity-40")}
                aria-disabled={page >= pages}
              >
                Older <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
