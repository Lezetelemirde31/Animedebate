import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import { ENABLED_ANIME } from "@/data/anime";
import { getServerTranslations } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/primitives";
import { CharacterBrowser } from "@/components/character/CharacterBrowser";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.characters.eyebrow };
}

export default async function CharactersPage({ searchParams }: { searchParams: Promise<{ anime?: string }> }) {
  const [{ anime }, { t }, rows] = await Promise.all([
    searchParams,
    getServerTranslations(),
    prisma.character.findMany({
      where: enabledCharacterWhere,
      include: { anime: { select: { name: true, shortName: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const items = rows.map(toCharacterDTO);
  const initialAnime = ENABLED_ANIME.some((a) => a.id === anime) ? anime : undefined;
  return (
    <>
      <PageHeader
        eyebrow={t.characters.eyebrow}
        title={
          <>
            {t.characters.titleStart} <span className="text-gradient">{t.characters.titleAccent}</span>
          </>
        }
        description={t.characters.description(items.length, ENABLED_ANIME.length)}
      />
      <CharacterBrowser key={initialAnime ?? "all"} items={items} mode="database" initialAnime={initialAnime} />
    </>
  );
}
