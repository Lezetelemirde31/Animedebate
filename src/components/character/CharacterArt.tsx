"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { getAnime } from "@/data/anime";
import { cn, initials } from "@/lib/utils";

/**
 * Character artwork with a generated fallback (anime-coloured card art with
 * initials) if the image is missing or fails to load.
 */
export function CharacterArt({
  name,
  animeId,
  imageUrl,
  className,
  eager,
}: {
  name: string;
  animeId: string;
  imageUrl: string | null;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const color = getAnime(animeId)?.color ?? "#a855f7";
  if (!imageUrl || failed) {
    return (
      <div
        className={cn("relative flex h-full w-full items-center justify-center overflow-hidden", className)}
        style={{ background: `radial-gradient(circle at 50% 30%, ${color}55, transparent 65%), linear-gradient(160deg, #1b1430, #050308)` }}
        role="img"
        aria-label={name}
      >
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: `repeating-linear-gradient(45deg, ${color}22 0 2px, transparent 2px 12px)` }} />
        <span className="relative font-display text-5xl font-bold" style={{ color, textShadow: `0 0 30px ${color}` }}>
          {initials(name)}
        </span>
      </div>
    );
  }
  return (
    <img
      src={imageUrl}
      alt={name}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover object-top", className)}
    />
  );
}
