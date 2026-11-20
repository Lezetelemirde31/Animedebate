import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { enabledCharacterWhere } from "@/lib/characters";
import { getServerTranslations } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/primitives";
import { CreateRoomForm } from "@/components/play/CreateRoomForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.play.createPageTitle };
}

export default async function CreateRoomPage() {
  await requireUser("/play/create");
  const [{ t }, counts] = await Promise.all([
    getServerTranslations(),
    prisma.character.groupBy({ by: ["animeId"], where: enabledCharacterWhere, _count: { _all: true } }),
  ]);
  const characterCounts = Object.fromEntries(counts.map((c) => [c.animeId, c._count._all]));
  return (
    <>
      <PageHeader
        eyebrow={t.play.createEyebrow}
        title={
          <>
            {t.play.createHeadingStart} <span className="text-gradient">{t.play.createHeadingAccent}</span>
          </>
        }
        description={t.play.createDescription}
      />
      <CreateRoomForm characterCounts={characterCounts} />
    </>
  );
}
