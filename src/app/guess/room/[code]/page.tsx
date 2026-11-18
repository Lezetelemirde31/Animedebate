import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { guessCharacters } from "@/server/guess/shared";
import { GuessRace } from "@/components/guess/GuessRace";
import { GUESS_TEXT } from "@/components/guess/texts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerTranslations();
  return { title: GUESS_TEXT[locale].title };
}

export default async function GuessRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  await requireUser(`/guess/room/${code}`);
  const names = (await guessCharacters()).list.map((c) => ({ id: c.id, name: c.name, animeId: c.animeId }));
  return <GuessRace code={code} names={names} />;
}
