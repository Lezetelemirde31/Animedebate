import Link from "next/link";
import { Zap } from "lucide-react";
import type { CharacterDTO } from "@/game/types";
import { RARITY_INFO } from "@/game/rarity";
import { cn } from "@/lib/utils";
import { CharacterArt } from "./CharacterArt";
import { AnimeBadge, RarityBadge } from "./badges";

export function CharacterCard({
  character,
  href,
  footer,
  className,
  compact,
}: {
  character: CharacterDTO;
  href?: string;
  footer?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const info = RARITY_INFO[character.rarity];
  const body = (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-ink-900/80 transition duration-300",
        "hover:-translate-y-1 hover:shadow-2xl",
        className,
      )}
      style={{ borderColor: `${info.color}40`, boxShadow: `0 0 0 1px ${info.color}14, 0 20px 40px -24px ${info.glow}` }}
    >
      <div className={cn("relative overflow-hidden", compact ? "aspect-[4/5]" : "aspect-[3/4]")}>
        <CharacterArt
          name={character.name}
          animeId={character.animeId}
          imageUrl={character.imageUrl}
          className="transition duration-500 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/10 to-transparent" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1"
          style={{ background: `linear-gradient(90deg, transparent, ${info.color}, transparent)` }}
        />
        <div className="absolute left-2 top-2">
          <RarityBadge rarity={character.rarity} />
        </div>
        {character.powerLevel !== null && !compact && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-amber-200 backdrop-blur">
            <Zap className="h-3 w-3" />
            {character.powerLevel}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="font-display text-sm font-semibold leading-tight text-white md:text-base">{character.name}</h3>
        {!compact && <p className="line-clamp-1 text-xs text-zinc-400">{character.title}</p>}
        <div className="mt-auto pt-1">
          <AnimeBadge animeId={character.animeId} />
        </div>
        {footer}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-2 focus-visible:outline-purple-400 rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}
