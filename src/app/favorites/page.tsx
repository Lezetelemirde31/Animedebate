import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, Flame, Swords } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { toCharacterDTO } from "@/lib/characters";
import { getServerTranslations } from "@/lib/i18n-server";
import { CharacterCard } from "@/components/character/CharacterCard";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.favoritesPage.title };
}

export default async function FavoritesPage() {
  const [user, { locale, t }] = await Promise.all([requireUser("/favorites"), getServerTranslations()]);
  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      character: { include: { anime: { select: { name: true, shortName: true } } } },
      debate: { include: { author: { select: { username: true } }, anime: { select: { shortName: true } } } },
      comparison: {
        include: {
          characterA: { select: { name: true } },
          characterB: { select: { name: true } },
        },
      },
    },
  });

  const characters = favorites.filter((f) => f.character).map((f) => toCharacterDTO(f.character!));
  const debates = favorites.filter((f) => f.debate).map((f) => f.debate!);
  const comparisons = favorites.filter((f) => f.comparison).map((f) => f.comparison!);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={t.favoritesPage.eyebrow}
        title={
          <>
            {t.favoritesPage.headingStart} <span className="text-gradient">{t.favoritesPage.headingAccent}</span>
          </>
        }
        description={t.favoritesPage.description}
      />

      {favorites.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={t.favoritesPage.emptyTitle}
          description={t.favoritesPage.emptyDesc}
          action={{ href: "/debates", label: t.favoritesPage.exploreDebates }}
        />
      ) : (
        <>
          <section>
            <h2 className="mb-4 font-display text-xl font-bold text-white">{t.favoritesPage.favCharacters(characters.length)}</h2>
            {characters.length === 0 ? (
              <p className="glass rounded-2xl p-6 text-sm text-zinc-500">{t.favoritesPage.noFavCharacters}</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {characters.map((c) => (
                  <CharacterCard key={c.id} character={c} href={`/characters/${c.id}`} locale={locale} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold text-white">
              <Flame className="h-5 w-5 text-rose-300" /> {t.favoritesPage.savedDebates(debates.length)}
            </h2>
            {debates.length === 0 ? (
              <p className="glass rounded-2xl p-6 text-sm text-zinc-500">{t.favoritesPage.noSavedDebates}</p>
            ) : (
              <div className="space-y-2.5">
                {debates.map((d) => (
                  <Link key={d.id} href={`/debates/${d.slug}`} className="glass block rounded-2xl p-4 transition hover:border-purple-500/40">
                    <div className="font-display font-semibold text-white">{d.title}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      {t.favoritesPage.byAuthor} {d.author.username} · {d.commentsCount} {t.favoritesPage.commentsWord} · {timeAgo(d.createdAt, locale)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold text-white">
              <Swords className="h-5 w-5 text-purple-300" /> {t.favoritesPage.savedComparisons(comparisons.length)}
            </h2>
            {comparisons.length === 0 ? (
              <p className="glass rounded-2xl p-6 text-sm text-zinc-500">{t.favoritesPage.noSavedComparisons}</p>
            ) : (
              <div className="space-y-2.5">
                {comparisons.map((c) => (
                  <Link key={c.id} href={`/comparisons/${c.slug}`} className="glass block rounded-2xl p-4 transition hover:border-purple-500/40">
                    <div className="font-display font-semibold text-white">{c.title}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      {c.characterA.name} vs {c.characterB.name} · {c.votesACount + c.votesBCount} {t.favoritesPage.votesWord}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
