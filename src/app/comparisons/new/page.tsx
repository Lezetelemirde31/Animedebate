import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { enabledCharacterWhere } from "@/lib/characters";
import { getServerTranslations } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/primitives";
import { CreateComparisonForm } from "@/components/community/CreateComparisonForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.comparisons.createMatchup };
}

export default async function NewComparisonPage() {
  await requireUser("/comparisons/new");
  const [{ t }, rows] = await Promise.all([
    getServerTranslations(),
    prisma.character.findMany({
      where: enabledCharacterWhere,
      include: { anime: { select: { shortName: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const characters = rows.map((r) => ({ id: r.id, name: r.name, animeName: r.anime.shortName }));

  return (
    <>
      <PageHeader
        eyebrow={t.comparisons.newEyebrow}
        title={
          <>
            {t.comparisons.newTitleStart} <span className="text-gradient">{t.comparisons.newTitleAccent}</span>
          </>
        }
      />
      <CreateComparisonForm characters={characters} />
    </>
  );
}
