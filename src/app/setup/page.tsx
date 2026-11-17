import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, DatabaseZap } from "lucide-react";
import { isDatabaseConfigured } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const TEXT = {
  tr: {
    title: "Veritabanı bağlantısı gerekiyor",
    intro:
      "Site şu an veritabanı olmadan demo modunda çalışıyor. Bu modda hesaplar, koleksiyonlar ve tartışmalar kalıcı değildir; sunucu yeniden başlayınca silinir.",
    stepsTitle: "Site sahibi için kurulum (yaklaşık 2 dakika)",
    steps: [
      "vercel.com'da projeni aç ve üst menüden Storage sekmesine gir.",
      "Create Database de, Neon (Postgres) seç ve ücretsiz planla oluştur.",
      "Açılan pencerede veritabanını bu projeye bağla (Connect).",
      "Deployments sekmesinde en üstteki yayının yanındaki ⋯ menüsünden Redeploy de.",
    ],
    done: "Yayın bitince tablolar ve karakterler kendiliğinden kurulur; kayıt, giriş ve tüm veriler kalıcı olur.",
    connected: "Veritabanı bağlı. Her şey kalıcı olarak kaydediliyor.",
    back: "Ana sayfaya dön",
  },
  en: {
    title: "A database connection is required",
    intro:
      "The site is currently running in demo mode without a database. In this mode accounts, collections and debates are not permanent and disappear when the server restarts.",
    stepsTitle: "Setup for the site owner (about 2 minutes)",
    steps: [
      "Open your project on vercel.com and go to the Storage tab.",
      "Click Create Database, choose Neon (Postgres) and create it on the free plan.",
      "In the dialog, connect the database to this project (Connect).",
      "In the Deployments tab, open the ⋯ menu of the latest deployment and click Redeploy.",
    ],
    done: "When the deployment finishes, tables and characters are set up automatically; sign-up, sign-in and all data become permanent.",
    connected: "A database is connected. Everything is stored permanently.",
    back: "Back to home",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: TEXT[await getServerLocale()].title };
}

/** Explains how to connect a database (linked from the demo-mode banner). */
export default async function SetupPage() {
  const t = TEXT[await getServerLocale()];
  const connected = isDatabaseConfigured();
  return (
    <div className="mx-auto max-w-2xl pt-4">
      <div className="glass-strong relative overflow-hidden rounded-3xl p-6 neon-border animate-slide-up sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-purple-600/30 blur-3xl" />
        <div className="relative">
          {connected ? (
            <>
              <CheckCircle2 className="h-10 w-10 text-emerald-300" />
              <h1 className="mt-4 font-display text-2xl font-bold text-white sm:text-3xl">{t.connected}</h1>
            </>
          ) : (
            <>
              <div className="inline-flex rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3">
                <DatabaseZap className="h-8 w-8 text-amber-200" />
              </div>
              <h1 className="mt-4 font-display text-2xl font-bold text-white sm:text-3xl">{t.title}</h1>
              <p className="mt-3 text-zinc-300">{t.intro}</p>
              <h2 className="mt-8 font-display text-sm font-semibold uppercase tracking-widest text-purple-300">{t.stepsTitle}</h2>
              <ol className="mt-4 space-y-3">
                {t.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-zinc-200">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-600/30 font-display font-bold text-purple-100">
                      {i + 1}
                    </span>
                    <span className="pt-1">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{t.done}</p>
            </>
          )}
          <Link href="/" className="btn btn-ghost mt-8">
            {t.back}
          </Link>
        </div>
      </div>
    </div>
  );
}
