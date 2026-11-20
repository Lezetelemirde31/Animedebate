import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/primitives";
import { PlayHub } from "@/components/play/PlayHub";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.play.title };
}

export default async function PlayPage() {
  await requireUser("/play");
  const { t } = await getServerTranslations();
  return (
    <>
      <PageHeader
        eyebrow={t.play.eyebrow}
        title={
          <>
            {t.play.headingStart} <span className="text-gradient">{t.play.headingAccent}</span>
          </>
        }
        description={t.play.description}
      />
      <PlayHub />
    </>
  );
}
