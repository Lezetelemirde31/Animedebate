import Link from "next/link";
import type { Locale } from "@/lib/i18n";

const TEXT = {
  tr: { banner: "Demo modu: veritabanı henüz bağlı değil. Hesaplar ve veriler kalıcı değildir.", link: "Nasıl bağlanır?" },
  en: { banner: "Demo mode: no database is connected yet. Accounts and data are not permanent.", link: "How to connect one" },
} as const;

/** Shown on every page while the site runs without a database. */
export function DemoModeBanner({ locale }: { locale: Locale }) {
  const t = TEXT[locale];
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10" data-testid="demo-banner">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm text-amber-100">
        <span>{t.banner}</span>
        <Link href="/setup" className="font-semibold underline underline-offset-4 hover:text-white">
          {t.link}
        </Link>
      </div>
    </div>
  );
}
