import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { getRoster } from "@/server/versus/service";
import { VersusRoom } from "@/components/versus/VersusRoom";
import { VERSUS_TEXT } from "@/components/versus/texts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerTranslations();
  return { title: VERSUS_TEXT[locale].title };
}

export default async function VersusMatchPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const user = await requireUser(`/versus/${code}`);
  const roster = (await getRoster()).list;
  return <VersusRoom code={code} userId={user.id} roster={roster} />;
}
