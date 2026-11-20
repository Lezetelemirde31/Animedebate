import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { QuizRunView } from "@/components/quiz/QuizRunView";
import { QUIZ_TEXT } from "@/components/quiz/texts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerTranslations();
  return { title: QUIZ_TEXT[locale].title };
}

export default async function QuizRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/quiz/run/${id}`);
  return <QuizRunView id={id} />;
}
