"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getMessages, LANG_COOKIE_NAME, type Locale, type TranslationMessages } from "@/lib/i18n";

interface LanguageContextValue {
  locale: Locale;
  t: TranslationMessages;
  setLocale: (next: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: DEFAULT_LOCALE,
  t: getMessages(DEFAULT_LOCALE),
  setLocale: () => undefined,
});

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      setLocaleState(next);
      if (typeof document !== "undefined") {
        document.cookie = `${LANG_COOKIE_NAME}=${next}; path=/; max-age=31536000; SameSite=Lax`;
        document.documentElement.lang = next;
      }
      router.refresh();
    },
    [locale, router],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      t: getMessages(locale),
      setLocale,
    }),
    [locale, setLocale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
