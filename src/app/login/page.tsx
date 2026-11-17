import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getAuthPageData } from "@/lib/auth/auth-page-data";
import { getCurrentUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.auth.loginMetaTitle };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/play");
  const data = await getAuthPageData();
  return (
    <AuthForm
      mode="login"
      next={next}
      featuredCharacters={data.featuredCharacters}
      totalCharacters={data.totalCharacters}
      animeCount={data.animeCount}
    />
  );
}
