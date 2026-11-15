import "server-only";
import { cookies } from "next/headers";
import { getMessages, LANG_COOKIE_NAME, normalizeLocale, type Locale } from "./i18n";

export async function getServerLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    return normalizeLocale(store.get(LANG_COOKIE_NAME)?.value);
  } catch {
    return "tr";
  }
}

export async function getServerTranslations() {
  const locale = await getServerLocale();
  return { locale, t: getMessages(locale) };
}
