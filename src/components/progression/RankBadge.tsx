import { Medal } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { rankForLevel } from "@/game/ranks";
import { cn } from "@/lib/utils";

/** A player's rank (derived from level) as a small colored chip. */
export function RankBadge({ level, locale, className, size = "sm" }: { level: number; locale: Locale; className?: string; size?: "xs" | "sm" }) {
  const rank = rankForLevel(level);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-display font-bold",
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2.5 py-0.5 text-xs",
        className,
      )}
      style={{ color: rank.color, borderColor: `${rank.color}66`, background: `${rank.color}1f` }}
      title={`${rank.name[locale]} · ${rank.tier}/10`}
      data-testid="rank-badge"
    >
      <Medal className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} /> {rank.name[locale]}
    </span>
  );
}
