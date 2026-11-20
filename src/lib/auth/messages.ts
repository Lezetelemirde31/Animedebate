import type { NextRequest } from "next/server";
import type { z } from "zod";
import { LANG_COOKIE_NAME, normalizeLocale, type Locale } from "@/lib/i18n";

export function getAuthRequestLocale(req: NextRequest): Locale {
  return normalizeLocale(req.cookies.get(LANG_COOKIE_NAME)?.value);
}

const AUTH_API_ERRORS = {
  tr: {
    crossSiteBlocked: "Güvenlik doğrulaması başarısız. Sayfayı yenileyip tekrar dene.",
    tooManyLogin: "Çok fazla başarısız giriş denemesi. Lütfen birkaç dakika bekle.",
    tooManyRegister: "Bu ağdan kısa sürede çok fazla hesap oluşturuldu. Daha sonra tekrar dene.",
    tooManyCheck: "Çok fazla istek gönderildi. Biraz bekle.",
    invalidCredentials: "Kullanıcı adı veya şifre hatalı.",
    accountSuspended: "Hesabın askıya alındı.",
    accountSuspendedWithReason: (reason: string) => `Hesabın askıya alındı: ${reason}`,
    usernameTaken: "Bu kullanıcı adı zaten alınmış.",
    usernameMin: "Kullanıcı adı en az 3 karakter olmalı.",
    usernameMax: "Kullanıcı adı en fazla 20 karakter olabilir.",
    usernameChars: "Kullanıcı adında sadece harf, rakam ve alt çizgi (_) kullanabilirsin.",
    usernameRequired: "Kullanıcı adını gir.",
    passwordMin: "Şifre en az 8 karakter olmalı.",
    passwordMax: "Şifre çok uzun.",
    passwordRequired: "Şifreni gir.",
    invalidAvatar: "Geçersiz amblem seçimi.",
    invalidInput: "Geçersiz giriş bilgisi.",
    genericError: "Kayıt sırasında beklenmeyen bir hata oluştu. Lütfen tekrar dene.",
  },
  en: {
    crossSiteBlocked: "Cross-site request blocked.",
    tooManyLogin: "Too many login attempts. Please wait a few minutes.",
    tooManyRegister: "Too many accounts created from this network. Try again later.",
    tooManyCheck: "Too many requests. Please slow down.",
    invalidCredentials: "Invalid username or password.",
    accountSuspended: "Your account has been suspended.",
    accountSuspendedWithReason: (reason: string) => `Account suspended: ${reason}`,
    usernameTaken: "That username is already taken.",
    usernameMin: "Username must be at least 3 characters.",
    usernameMax: "Username must be at most 20 characters.",
    usernameChars: "Use only letters, numbers and underscores.",
    usernameRequired: "Enter your username.",
    passwordMin: "Password must be at least 8 characters.",
    passwordMax: "Password is too long.",
    passwordRequired: "Enter your password.",
    invalidAvatar: "Invalid avatar style.",
    invalidInput: "Invalid input.",
    genericError: "Unexpected server error. Please try again.",
  },
} as const;

export function authErrorMessage(
  locale: Locale,
  key: Exclude<keyof (typeof AUTH_API_ERRORS)["en"], "accountSuspendedWithReason">,
): string {
  return AUTH_API_ERRORS[locale][key];
}

export function authSuspendedMessage(locale: Locale, reason: string | null): string {
  if (!reason) return AUTH_API_ERRORS[locale].accountSuspended;
  return AUTH_API_ERRORS[locale].accountSuspendedWithReason(reason);
}

const ZOD_TO_KEY: Record<string, Exclude<keyof (typeof AUTH_API_ERRORS)["en"], "accountSuspendedWithReason">> = {
  "Username must be at least 3 characters.": "usernameMin",
  "Username must be at most 20 characters.": "usernameMax",
  "Use only letters, numbers and underscores.": "usernameChars",
  "Enter your username.": "usernameRequired",
  "Password must be at least 8 characters.": "passwordMin",
  "Password is too long.": "passwordMax",
  "Enter your password.": "passwordRequired",
  "Invalid avatar style.": "invalidAvatar",
};

export function localizeAuthZodError(error: z.ZodError, locale: Locale): string {
  const raw = error.issues[0]?.message;
  if (raw && raw in ZOD_TO_KEY) {
    return AUTH_API_ERRORS[locale][ZOD_TO_KEY[raw]];
  }
  return AUTH_API_ERRORS[locale].invalidInput;
}
