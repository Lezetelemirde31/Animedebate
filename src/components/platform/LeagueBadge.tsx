import { Shield } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { leagueFor } from "@/game/platform";

/** League chip for a game rating (Bronze … Legend). */
export function LeagueBadge({ rating, locale }: { rating: number; locale: Locale }) {
  const l = leagueFor(rating);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[11px] font-bold"
      style={{ color: l.color, borderColor: `${l.color}66`, background: `${l.color}1a` }}
    >
      <Shield className="h-3 w-3" /> {l.name[locale]}
    </span>
  );
}
