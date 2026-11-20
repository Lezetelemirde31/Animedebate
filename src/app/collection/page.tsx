import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Gem, Library, Sparkles, Swords } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import { RARITY_LABELS } from "@/lib/i18n";
import { getServerTranslations } from "@/lib/i18n-server";
import { ENABLED_ANIME } from "@/data/anime";
import { RARITIES, RARITY_INFO, characterScore } from "@/game/rarity";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/primitives";
import { CharacterBrowser, type BrowserItem } from "@/components/character/CharacterBrowser";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.collection.title };
}

export default async function CollectionPage() {
  const [user, { locale, t }] = await Promise.all([requireUser("/collection"), getServerTranslations()]);
  const [owned, totalCharacters] = await Promise.all([
    prisma.ownedCharacter.findMany({
      where: { userId: user.id, character: enabledCharacterWhere },
      include: { character: { include: { anime: { select: { name: true, shortName: true } } } } },
    }),
    prisma.character.count({ where: enabledCharacterWhere }),
  ]);

  const items: BrowserItem[] = owned.map((o) => ({
    ...toCharacterDTO(o.character),
    owned: { copies: o.copies, lastPrice: o.lastPrice, totalSpent: o.totalSpent, acquiredAt: o.lastAcquiredAt.getTime() },
  }));
  const spent = owned.reduce((s, o) => s + o.totalSpent, 0);
  const value = owned.reduce((s, o) => s + characterScore(o.character), 0);
  const byRarity = [...RARITIES].reverse().map((r) => ({ r, n: owned.filter((o) => o.character.rarity === r).length }));
  const byAnime = ENABLED_ANIME.map((a) => ({ a, n: owned.filter((o) => o.character.animeId === a.id).length }));

  return (
    <>
      <PageHeader
        eyebrow={t.collection.eyebrow}
        title={
          <>
            {t.collection.headingStart} <span className="text-gradient">{t.collection.headingAccent}</span>
          </>
        }
        description={t.collection.description}
      />
      {owned.length === 0 ? (
        <EmptyState
          icon={Library}
          title={t.collection.emptyTitle}
          description={t.collection.emptyDesc}
          action={{ href: "/play", label: t.collection.playMatch }}
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label={t.collection.uniqueChars} value={`${owned.length}/${totalCharacters}`} icon={Library} accent="purple" />
            <StatTile label={t.collection.totalCopies} value={owned.reduce((s, o) => s + o.copies, 0)} icon={Sparkles} accent="sky" />
            <StatTile label={t.collection.collectionScore} value={value} icon={Gem} accent="amber" hint={t.collection.raritySumHint} />
            <StatTile label={t.collection.virtualSpent} value={`$${spent}`} icon={Coins} accent="red" />
          </div>
          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <div className="glass rounded-2xl p-5">
              <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.collection.byRarity}</h3>
              <div className="space-y-2">
                {byRarity.map(({ r, n }) => (
                  <div key={r} className="flex items-center gap-3 text-sm">
                    <span className="w-20" style={{ color: RARITY_INFO[r].color }}>
                      {RARITY_LABELS[locale][r]}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full" style={{ width: `${(n / owned.length) * 100}%`, background: RARITY_INFO[r].color }} />
                    </div>
                    <span className="w-6 text-right text-zinc-300">{n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass rounded-2xl p-5">
              <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.collection.byAnime}</h3>
              <div className="space-y-2">
                {byAnime.map(({ a, n }) => (
                  <div key={a.id} className="flex items-center gap-3 text-sm">
                    <span className="w-28 truncate" style={{ color: a.color }}>
                      {a.shortName}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full" style={{ width: `${(n / owned.length) * 100}%`, background: a.color }} />
                    </div>
                    <span className="w-6 text-right text-zinc-300">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <CharacterBrowser items={items} mode="collection" />
        </>
      )}
    </>
  );
}
