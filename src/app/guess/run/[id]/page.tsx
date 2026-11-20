import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { guessCharacters } from "@/server/guess/shared";
import { GuessRunView } from "@/components/guess/GuessRunView";
import { GUESS_TEXT } from "@/components/guess/texts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerTranslations();
  return { title: GUESS_TEXT[locale].title };
}

export default async function GuessRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/guess/run/${id}`);
  const names = (await guessCharacters()).list.map((c) => ({ id: c.id, name: c.name, animeId: c.animeId }));
  return <GuessRunView id={id} names={names} />;
}
