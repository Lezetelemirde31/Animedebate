import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { enabledCharacterWhere } from "@/lib/characters";
import { getServerTranslations } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/primitives";
import { CreateDebateForm } from "@/components/community/CreateDebateForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.debates.startDebate };
}

export default async function NewDebatePage({ searchParams }: { searchParams: Promise<{ character?: string }> }) {
  await requireUser("/debates/new");
  const [{ character }, { t }, characters] = await Promise.all([
    searchParams,
    getServerTranslations(),
    prisma.character.findMany({
      where: enabledCharacterWhere,
      select: { id: true, name: true, animeId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={t.debates.newEyebrow}
        title={
          <>
            {t.debates.newTitleStart} <span className="text-gradient">{t.debates.newTitleAccent}</span>
          </>
        }
      />
      <CreateDebateForm characters={characters} defaultCharacterId={character ?? ""} />
    </>
  );
}
