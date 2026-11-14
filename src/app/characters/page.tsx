import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import { ENABLED_ANIME } from "@/data/anime";
import { PageHeader } from "@/components/ui/primitives";
import { CharacterBrowser } from "@/components/character/CharacterBrowser";

export const metadata: Metadata = { title: "Character database" };
export const dynamic = "force-dynamic";

export default async function CharactersPage({ searchParams }: { searchParams: Promise<{ anime?: string }> }) {
  const { anime } = await searchParams;
  const rows = await prisma.character.findMany({
    where: enabledCharacterWhere,
    include: { anime: { select: { name: true, shortName: true } } },
    orderBy: { name: "asc" },
  });
  const items = rows.map(toCharacterDTO);
  const initialAnime = ENABLED_ANIME.some((a) => a.id === anime) ? anime : undefined;
  return (
    <>
      <PageHeader
        eyebrow="Character database"
        title={<>Every character up for <span className="text-gradient">auction</span></>}
        description={`${items.length} curated characters across ${ENABLED_ANIME.length} anime. Any of them can appear in your next match.`}
      />
      <CharacterBrowser key={initialAnime ?? "all"} items={items} mode="database" initialAnime={initialAnime} />
    </>
  );
}
