"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAST_STAGE, type GuessMode } from "@/game/guess/rules";

/**
 * The disguised picture. A new stage is loaded in the background and swapped
 * in when ready, so the picture never flashes empty; a failed load (for
 * example a stage requested a moment too early) is retried.
 */
export function GuessPicture({
  src,
  mode,
  stage,
  label,
  revealUrl,
  revealName,
  className,
}: {
  src: string | null;
  mode: GuessMode;
  stage: number;
  label: string;
  /** Once the round is over: the original artwork. */
  revealUrl?: string | null;
  revealName?: string;
  className?: string;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) {
          setShown(src);
          setFailures(0);
        }
      };
      img.onerror = () => {
        if (cancelled) return;
        setFailures(attempt + 1);
        if (attempt < 4) retry = setTimeout(() => load(attempt + 1), 700 * (attempt + 1));
      };
      img.src = src;
    };
    load(0);
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [src]);

  const wide = mode === "EYES" && !revealUrl;
  return (
    <div
      className={cn("relative mx-auto flex aspect-[3/4] w-full max-w-[min(24rem,32vh)] lg:max-w-[min(24rem,52vh)] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black", className)}
      data-testid="guess-picture"
      data-stage={stage}
    >
      {revealUrl ? (
        <img src={revealUrl} alt={revealName ?? ""} className="h-full w-full animate-slide-up object-cover" />
      ) : shown ? (
        <img
          src={shown}
          alt={label}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          className={cn("select-none transition-opacity duration-300", wide ? "w-full object-contain" : "h-full w-full object-cover")}
        />
      ) : (
        <Loader2 className="h-8 w-8 animate-spin text-lime-300" />
      )}
      {!revealUrl && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent px-3 pb-2.5 pt-8">
          <span className="truncate whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-lime-200 sm:text-[11px]">{label}</span>
          <span className="ml-2 flex shrink-0 gap-1" aria-hidden>
            {Array.from({ length: LAST_STAGE + 1 }, (_, i) => (
              <span key={i} className={cn("h-1.5 w-3 rounded-full sm:w-5", i <= stage ? "bg-lime-300" : "bg-white/20")} />
            ))}
          </span>
        </div>
      )}
      {failures > 4 && !shown && <span className="absolute text-xs text-zinc-500">…</span>}
    </div>
  );
}
