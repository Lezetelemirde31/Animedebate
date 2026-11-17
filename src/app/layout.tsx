import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Chakra_Petch, Outfit } from "next/font/google";
import { getCurrentUser } from "@/lib/auth/server";
import { isDatabaseConfigured } from "@/lib/db";
import { DemoModeBanner } from "@/components/layout/DemoModeBanner";
import { getServerTranslations } from "@/lib/i18n-server";
import { LanguageProvider } from "@/components/providers/LanguageProvider";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { SocketProvider } from "@/components/providers/SocketProvider";
import { Navbar } from "@/components/layout/Navbar";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { ENABLED_ANIME } from "@/data/anime";
import "./globals.css";

const display = Chakra_Petch({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-chakra" });
const body = Outfit({ subsets: ["latin", "latin-ext"], variable: "--font-outfit" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return {
    title: { default: t.meta.titleDefault, template: t.meta.titleTemplate },
    description: t.meta.description,
  };
}

export const viewport: Viewport = {
  themeColor: "#050308",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, { locale, t }] = await Promise.all([getCurrentUser(), getServerTranslations()]);
  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="app-backdrop" aria-hidden />
        <LanguageProvider initialLocale={locale}>
          <SessionProvider user={user}>
            <SocketProvider>
              <Navbar />
              {!isDatabaseConfigured() && <DemoModeBanner locale={locale} />}
              <main className="mx-auto min-h-[calc(100svh-4rem)] max-w-7xl px-4 pb-20 pt-8">{children}</main>
              <ScrollToTop />
              <footer className="border-t border-white/5 py-8 text-sm text-zinc-500">
                <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 md:flex-row md:items-center md:justify-between">
                  <p>{t.footer.tagline}</p>
                  <p className="flex flex-wrap gap-x-3 gap-y-1">
                    {ENABLED_ANIME.map((a) => (
                      <Link key={a.id} href={`/characters?anime=${a.id}`} className="hover:text-zinc-300" style={{ color: `${a.color}cc` }}>
                        {a.shortName}
                      </Link>
                    ))}
                  </p>
                </div>
                <p className="mx-auto mt-3 max-w-7xl px-4 text-xs text-zinc-600">{t.footer.attribution}</p>
              </footer>
            </SocketProvider>
          </SessionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
