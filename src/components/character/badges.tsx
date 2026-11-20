import { getAnime } from "@/data/anime";
import { RARITY_INFO, type Rarity } from "@/game/rarity";
import { RARITY_LABELS, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function RarityBadge({
  rarity,
  className,
  size = "sm",
  locale = "tr",
}: {
  rarity: Rarity;
  className?: string;
  size?: "sm" | "md";
  locale?: Locale;
}) {
  const info = RARITY_INFO[rarity];
  const label = RARITY_LABELS[locale][rarity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-display font-semibold uppercase tracking-wider",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
        className,
      )}
      style={{
        color: info.color,
        borderColor: `${info.color}88`,
        background: `linear-gradient(${info.color}2e, ${info.color}2e), rgba(8, 5, 14, 0.9)`,
        boxShadow: `0 0 12px -4px ${info.glow}`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.color }} />
      {label}
    </span>
  );
}

export function AnimeBadge({ animeId, className }: { animeId: string; className?: string }) {
  const anime = getAnime(animeId);
  const color = anime?.color ?? "#a855f7";
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
    >
      {anime?.shortName ?? animeId}
    </span>
  );
}
