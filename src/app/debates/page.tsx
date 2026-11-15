import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Lock, MessageSquare, Pin, Plus, Search, ThumbsUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { ENABLED_ANIME } from "@/data/anime";
import { getServerTranslations } from "@/lib/i18n-server";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { AnimeBadge } from "@/components/character/badges";
import { cn, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.debates.pageTitle };
}

export default async function DebatesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; anime?: string; sort?: string; q?: string }>;
}) {
  const [{ category = "ALL", anime = "", sort = "recent", q = "" }, { locale, t }] = await Promise.all([
    searchParams,
    getServerTranslations(),
  ]);

  const CATEGORIES = [
    { id: "ALL", label: t.debates.categories.ALL },
    { id: "POWER_SCALING", label: t.debates.categories.POWER_SCALING },
    { id: "LORE", label: t.debates.categories.LORE },
    { id: "HOT_TAKE", label: t.debates.categories.HOT_TAKE },
    { id: "GENERAL", label: t.debates.categories.GENERAL },
  ] as const;

  const where: Record<string, unknown> = { status: { not: "HIDDEN" } };
  if (category !== "ALL" && ["POWER_SCALING", "LORE", "HOT_TAKE", "GENERAL"].includes(category)) {
    where.category = category;
  }
  if (anime && ENABLED_ANIME.some((a) => a.id === anime)) {
    where.animeId = anime;
  }
  if (q.trim()) {
    where.title = { contains: q.trim(), mode: "insensitive" };
  }

  const orderBy =
    sort === "popular"
      ? [{ isPinned: "desc" as const }, { likesCount: "desc" as const }, { createdAt: "desc" as const }]
      : sort === "discussed"
        ? [{ isPinned: "desc" as const }, { commentsCount: "desc" as const }, { createdAt: "desc" as const }]
        : [{ isPinned: "desc" as const }, { createdAt: "desc" as const }];

  const debates = await prisma.debate.findMany({
    where,
    orderBy,
    take: 40,
    include: {
      author: {
        select: {
          username: true,
          level: true,
          avatarStyle: true,
          avatarCustomUrl: true,
          avatarCharacter: { select: { imageUrl: true } },
        },
      },
      anime: { select: { id: true, shortName: true } },
      character: { select: { id: true, name: true } },
    },
  });

  const buildUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams();
    const next = { category, anime, sort, q, ...overrides };
    if (next.category && next.category !== "ALL") p.set("category", next.category);
    if (next.anime) p.set("anime", next.anime);
    if (next.sort && next.sort !== "recent") p.set("sort", next.sort);
    if (next.q) p.set("q", next.q);
    const qs = p.toString();
    return `/debates${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow={t.debates.eyebrow}
        title={
          <>
            {t.debates.titleStart} <span className="text-gradient">{t.debates.titleAccent}</span>
          </>
        }
        description={t.debates.description}
        actions={
          <Link href="/debates/new" className="btn btn-primary">
            <Plus className="h-4 w-4" /> {t.debates.startDebate}
          </Link>
        }
      />

      {/* Filter bar */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Link key={c.id} href={buildUrl({ category: c.id })} className="chip" data-active={category === c.id}>
                {c.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "recent", label: t.debates.sorts.recent },
              { id: "popular", label: t.debates.sorts.popular },
              { id: "discussed", label: t.debates.sorts.discussed },
            ].map((s) => (
              <Link key={s.id} href={buildUrl({ sort: s.id })} className="chip" data-active={sort === s.id}>
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <form action="/debates" className="relative flex-1">
            {category !== "ALL" && <input type="hidden" name="category" value={category} />}
            {anime && <input type="hidden" name="anime" value={anime} />}
            {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input name="q" defaultValue={q} placeholder={t.debates.searchPlaceholder} className="input pl-10" />
          </form>
          <div className="flex flex-wrap gap-1.5">
            <Link href={buildUrl({ anime: "" })} className="chip" data-active={!anime}>
              {t.debates.allAnime}
            </Link>
            {ENABLED_ANIME.map((a) => (
              <Link key={a.id} href={buildUrl({ anime: a.id })} className="chip" data-active={anime === a.id}>
                {a.shortName}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {debates.length === 0 ? (
        <EmptyState
          icon={Flame}
          title={t.debates.emptyTitle}
          description={t.debates.emptyDesc}
          action={{ href: "/debates/new", label: t.debates.startDebate }}
        />
      ) : (
        <div className="space-y-3">
          {debates.map((d) => {
            const avatarImg = d.author.avatarCustomUrl ?? d.author.avatarCharacter?.imageUrl ?? null;
            const catLabel = t.debates.categories[d.category as keyof typeof t.debates.categories] ?? d.category.replace("_", " ");
            return (
              <Link
                key={d.id}
                href={`/debates/${d.slug}`}
                className={cn(
                  "glass block rounded-2xl p-5 transition hover:border-purple-500/40",
                  d.isPinned && "neon-border",
                )}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {d.isPinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2.5 py-0.5 font-semibold text-purple-200">
                          <Pin className="h-3 w-3" /> {t.debates.pinned}
                        </span>
                      )}
                      {d.status === "LOCKED" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 font-semibold text-amber-200">
                          <Lock className="h-3 w-3" /> {t.debates.locked}
                        </span>
                      )}
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-zinc-300">
                        {catLabel}
                      </span>
                      {d.anime && <AnimeBadge animeId={d.anime.id} />}
                      {d.character && <span className="text-xs text-purple-300">#{d.character.name}</span>}
                    </div>
                    <h2 className="font-display text-xl font-bold text-white">{d.title}</h2>
                    <p className="line-clamp-2 text-sm text-zinc-400">{d.content}</p>
                    <div className="flex items-center gap-2.5 pt-1 text-xs text-zinc-400">
                      <Avatar username={d.author.username} style={d.author.avatarStyle} imageUrl={avatarImg} size={22} />
                      <span className="font-medium text-zinc-200">{d.author.username}</span>
                      <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] text-purple-200">
                        {t.nav.levelShort}.{d.author.level}
                      </span>
                      <span>· {timeAgo(d.createdAt, locale)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 text-sm text-zinc-300 md:shrink-0">
                    <div className="flex items-center gap-1.5">
                      <ThumbsUp className="h-4 w-4 text-emerald-300" />
                      <span className="font-display font-semibold tabular-nums">{d.likesCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-purple-300" />
                      <span className="font-display font-semibold tabular-nums">{d.commentsCount}</span>
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
