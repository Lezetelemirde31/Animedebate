import type { Locale } from "@/lib/i18n";
import { BADGE_TEXT } from "@/lib/i18n";

interface StoredNotification {
  type: string;
  title: string;
  message: string;
  params?: unknown;
}

type Params = Record<string, string | number | undefined>;

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/**
 * Builds a notification's title and message in the reader's language.
 * New notifications store their values in `params`; older rows (or unknown
 * types) keep the text they were stored with.
 */
export function notificationText(n: StoredNotification, locale: Locale): { title: string; message: string } {
  const p = (n.params && typeof n.params === "object" ? n.params : null) as Params | null;
  const stored = { title: n.title, message: n.message };
  if (!p) return stored;
  const tr = locale === "tr";

  switch (n.type) {
    case "LEVEL_UP": {
      const level = str(p.level);
      if (!level) return stored;
      return tr
        ? { title: `Seviye ${level}'e ulaştın!`, message: `Yeterli XP topladın ve Seviye ${level}'e yükseldin.` }
        : { title: `Level ${level} Reached!`, message: `You earned enough XP to advance to Level ${level}.` };
    }
    case "BADGE_EARNED": {
      const loc = BADGE_TEXT[locale]?.[str(p.badge)];
      const name = loc?.name ?? (str(p.name) || n.title);
      const description = loc?.description ?? (str(p.description) || n.message);
      return { title: tr ? `Rozet kazandın: ${name}` : `Badge Unlocked: ${name}`, message: description };
    }
    case "MODERATION":
      if (p.kind === "restored") {
        return tr
          ? { title: "Hesabın geri açıldı", message: "Hesabındaki askıya alma kaldırıldı." }
          : { title: "Account restored", message: "Your account suspension has been lifted." };
      }
      return stored;
    case "COMMENT_REPLY": {
      const actor = str(p.actor);
      if (!actor) return stored;
      return { title: tr ? `${actor} yorumuna yanıt verdi` : `${actor} replied to your comment`, message: n.message };
    }
    case "COMMENT_ON_DEBATE":
    case "COMMENT_ON_COMPARISON": {
      const actor = str(p.actor);
      const target = str(p.target);
      if (!actor) return stored;
      return { title: tr ? `${actor}, "${target}" için yorum yaptı` : `${actor} commented on "${target}"`, message: n.message };
    }
    default:
      return stored;
  }
}
