import { getAnime } from "@/data/anime";
import { RARITY_INFO, type Rarity } from "@/game/rarity";
import { cn } from "@/lib/utils";

export function RarityBadge({ rarity, className, size = "sm" }: { rarity: Rarity; className?: string; size?: "sm" | "md" }) {
  const info = RARITY_INFO[rarity];
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
        // Tinted, mostly opaque base so the badge stays readable over bright artwork.
        background: `linear-gradient(${info.color}2e, ${info.color}2e), rgba(8, 5, 14, 0.82)`,
        boxShadow: `0 0 14px -4px ${info.glow}`,
        backdropFilter: "blur(6px)",
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.color }} />
      {info.label}
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
