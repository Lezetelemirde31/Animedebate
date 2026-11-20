import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare, Plus, Swords, ThumbsUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { getServerTranslations } from "@/lib/i18n-server";
import { CharacterArt } from "@/components/character/CharacterArt";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.comparisons.pageTitle };
}

export default async function ComparisonsPage({ searchParams }: { searchParams: Promise<{ criteria?: string }> }) {
  const [{ criteria = "ALL" }, { locale, t }] = await Promise.all([searchParams, getServerTranslations()]);

  const CRITERIA = [
    { id: "ALL", label: t.comparisons.criteria.ALL },
    { id: "COMBAT", label: t.comparisons.criteria.COMBAT },
    { id: "OVERALL", label: t.comparisons.criteria.OVERALL },
    { id: "WRITING", label: t.comparisons.criteria.WRITING },
    { id: "INTELLIGENCE", label: t.comparisons.criteria.INTELLIGENCE },
  ] as const;

  const where: Record<string, unknown> = { status: { not: "HIDDEN" } };
  if (criteria !== "ALL" && ["COMBAT", "OVERALL", "WRITING", "INTELLIGENCE"].includes(criteria)) {
    where.criteria = criteria;
  }

  const comparisons = await prisma.characterComparison.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      author: { select: { username: true, level: true } },
      characterA: { select: { id: true, name: true, animeId: true, imageUrl: true } },
      characterB: { select: { id: true, name: true, animeId: true, imageUrl: true } },
    },
  });

  return (
    <>
      <PageHeader
        eyebrow={t.comparisons.eyebrow}
        title={
          <>
            {t.comparisons.titleStart} <span className="text-gradient">{t.comparisons.titleAccent}</span>
          </>
        }
        description={t.comparisons.description}
        actions={
          <Link href="/comparisons/new" className="btn btn-primary">
            <Plus className="h-4 w-4" /> {t.comparisons.createMatchup}
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {CRITERIA.map((c) => (
          <Link
            key={c.id}
            href={c.id === "ALL" ? "/comparisons" : `/comparisons?criteria=${c.id}`}
            className="chip"
            data-active={criteria === c.id}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {comparisons.length === 0 ? (
        <EmptyState
          icon={Swords}
          title={t.comparisons.emptyTitle}
          description={t.comparisons.emptyDesc}
          action={{ href: "/comparisons/new", label: t.comparisons.createMatchup }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {comparisons.map((c) => {
            const total = c.votesACount + c.votesBCount;
            const pctA = total > 0 ? Math.round((c.votesACount / total) * 100) : 50;
            const pctB = total > 0 ? 100 - pctA : 50;
            const critLabel = t.comparisons.criteria[c.criteria as keyof typeof t.comparisons.criteria] ?? c.criteria;
            return (
              <Link
                key={c.id}
                href={`/comparisons/${c.slug}`}
                className="glass group flex flex-col justify-between rounded-3xl p-5 transition hover:-translate-y-0.5 hover:border-purple-500/40"
              >
                <div>
                  <div className="mb-4 flex items-center justify-between text-xs text-zinc-400">
                    <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-0.5 font-semibold uppercase tracking-wider text-purple-200">
                      {critLabel}
                    </span>
                    <span>
                      {t.comparisons.byAuthor} {c.author.username} · {timeAgo(c.createdAt, locale)}
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-purple-500/40">
                        <CharacterArt name={c.characterA.name} animeId={c.characterA.animeId} imageUrl={c.characterA.imageUrl} />
                      </div>
                      <span className="font-display text-sm font-bold text-white">{c.characterA.name}</span>
                    </div>
                    <span className="font-display text-sm font-black text-rose-400">VS</span>
                    <div className="flex flex-row-reverse items-center gap-3 text-right">
                      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-rose-500/40">
                        <CharacterArt name={c.characterB.name} animeId={c.characterB.animeId} imageUrl={c.characterB.imageUrl} />
                      </div>
                      <span className="font-display text-sm font-bold text-white">{c.characterB.name}</span>
                    </div>
                  </div>

                  <h2 className="mt-4 font-display text-lg font-bold text-white group-hover:text-purple-200">{c.title}</h2>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] font-semibold">
                      <span className="text-purple-300">
                        {pctA}% ({c.votesACount})
                      </span>
                      <span className="text-rose-300">
                        {pctB}% ({c.votesBCount})
                      </span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
                      <div className="bg-purple-500" style={{ width: `${pctA}%` }} />
                      <div className="bg-rose-500" style={{ width: `${pctB}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{t.comparisons.totalVotes(total)}</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3.5 w-3.5 text-emerald-300" /> {c.likesCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5 text-purple-300" /> {c.commentsCount}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
