import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { QuizRace } from "@/components/quiz/QuizRace";
import { QUIZ_TEXT } from "@/components/quiz/texts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerTranslations();
  return { title: QUIZ_TEXT[locale].title };
}

export default async function QuizRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  await requireUser(`/quiz/room/${code}`);
  return <QuizRace code={code} />;
}
