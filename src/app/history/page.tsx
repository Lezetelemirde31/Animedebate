import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History, Radio } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { Avatar } from "@/components/ui/Avatar";
import { CharacterArt } from "@/components/character/CharacterArt";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { RARITY_INFO } from "@/game/rarity";
import { cn, timeAgo } from "@/lib/utils";

const PAGE_SIZE = 10;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.history.title };
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [user, { locale, t }, sp] = await Promise.all([requireUser("/history"), getServerTranslations(), searchParams]);
  const page = Math.max(1, Number(sp.page) || 1);

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
        eyebrow={t.history.eyebrow}
        title={
          <>
            {t.history.headingStart} <span className="text-gradient">{t.history.headingAccent}</span>
          </>
        }
        description={t.history.description}
      />
      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title={t.history.emptyTitle}
          description={t.history.emptyDesc}
          action={{ href: "/play", label: t.history.startFirst }}
        />
      ) : (
        <div className="space-y-3">
          {entries.map((mp) => {
            const m = mp.match;
            const opp = m.players.find((p) => p.userId !== user.id);
            const live = m.status === "IN_PROGRESS";
            const label = live
              ? t.history.live
              : m.status === "ABANDONED"
                ? t.history.abandoned
                : mp.result === "WIN"
                  ? t.history.victory
                  : mp.result === "LOSS"
                    ? t.history.defeat
                    : t.history.draw;
            return (
              <Link
                key={mp.id}
                href={live ? `/room/${m.code}` : `/history/${m.id}`}
                className="glass flex flex-col gap-4 rounded-2xl p-4 transition hover:border-purple-500/30 md:flex-row md:items-center"
              >
                <div className="flex items-center gap-4 md:w-72">
                  <span
                    className={cn(
                      "flex w-28 items-center justify-center gap-1 rounded-full px-2 py-1 font-display text-xs font-bold uppercase tracking-wider",
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
                      <span className="text-sm text-zinc-500">{t.history.noOpponent}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
                  {m.lots.length === 0 ? (
                    <span className="text-sm text-zinc-500">{t.history.noCharsWon}</span>
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
                    <div className="font-display font-semibold text-white">{live ? "?" : mp.score} {t.home.points}</div>
                    <div className="text-xs text-zinc-500">${m.startingBalance - mp.balance}</div>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <div>{t.history.lotsWord(m._count.lots)}</div>
                    <div>{timeAgo(m.endedAt ?? m.createdAt, locale)}</div>
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
                <ChevronLeft className="h-4 w-4" /> {t.history.newer}
              </Link>
              <span className="text-sm text-zinc-400">{t.history.pageOf(page, pages)}</span>
              <Link
                href={`/history?page=${page + 1}`}
                className={cn("btn btn-ghost !py-2", page >= pages && "pointer-events-none opacity-40")}
                aria-disabled={page >= pages}
              >
                {t.history.older} <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
