"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Swords, Zap } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { CharacterArt } from "@/components/character/CharacterArt";
import { AnimeBadge } from "@/components/character/badges";
import { cn } from "@/lib/utils";

interface FighterCard {
  id: string;
  name: string;
  title: string;
  animeId: string;
  imageUrl: string | null;
  powerLevel: number | null;
}

export function ComparisonVoteBar({
  comparisonId,
  charA,
  charB,
  initialVotesA,
  initialVotesB,
  initialSide,
  signedIn,
  locked,
}: {
  comparisonId: string;
  charA: FighterCard;
  charB: FighterCard;
  initialVotesA: number;
  initialVotesB: number;
  initialSide: "A" | "B" | null;
  signedIn: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [votesA, setVotesA] = useState(initialVotesA);
  const [votesB, setVotesB] = useState(initialVotesB);
  const [side, setSide] = useState<"A" | "B" | null>(initialSide);
  const [pending, setPending] = useState(false);

  const total = votesA + votesB;
  const pctA = total > 0 ? Math.round((votesA / total) * 100) : 50;
  const pctB = total > 0 ? 100 - pctA : 50;

  async function vote(choice: "A" | "B") {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    if (locked || pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/comparisons/${comparisonId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: choice }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        side?: "A" | "B";
        votesACount?: number;
        votesBCount?: number;
      } | null;
      if (res.ok && data?.ok) {
        setSide(data.side ?? choice);
        if (typeof data.votesACount === "number") setVotesA(data.votesACount);
        if (typeof data.votesBCount === "number") setVotesB(data.votesBCount);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass-strong rounded-3xl p-5 md:p-7 neon-border">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
        {/* Fighter A */}
        <div
          className={cn(
            "glass relative flex flex-col overflow-hidden rounded-2xl border p-4 transition",
            side === "A" ? "border-purple-400 neon-border" : "border-white/10",
          )}
        >
          <div className="flex items-center gap-4">
            <Link href={`/characters/${charA.id}`} className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-purple-500/40">
              <CharacterArt name={charA.name} animeId={charA.animeId} imageUrl={charA.imageUrl} eager />
            </Link>
            <div className="min-w-0 flex-1">
              <AnimeBadge animeId={charA.animeId} />
              <Link href={`/characters/${charA.id}`} className="mt-1.5 block font-display text-xl font-bold text-white hover:underline">
                {charA.name}
              </Link>
              <p className="truncate text-xs text-zinc-400">{charA.title}</p>
              {charA.powerLevel !== null && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-300">
                  <Zap className="h-3.5 w-3.5" /> {t.comparisons.powerShort} {charA.powerLevel}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={locked || pending}
            onClick={() => vote("A")}
            className={cn("btn mt-4 w-full", side === "A" ? "btn-primary" : "btn-ghost")}
          >
            {side === "A" && <Check className="h-4 w-4" />}
            {t.comparisons.voteBtn(charA.name, votesA)}
          </button>
        </div>

        {/* VS emblem */}
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/40 bg-gradient-to-br from-purple-600/30 to-rose-600/30 font-display text-lg font-black text-white shadow-[0_0_24px_-4px_rgba(244,63,94,0.7)]">
            <Swords className="h-6 w-6" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.comparisons.votesLabel(total)}</span>
        </div>

        {/* Fighter B */}
        <div
          className={cn(
            "glass relative flex flex-col overflow-hidden rounded-2xl border p-4 transition",
            side === "B" ? "border-rose-400 neon-border-red" : "border-white/10",
          )}
        >
          <div className="flex items-center gap-4">
            <Link href={`/characters/${charB.id}`} className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-rose-500/40">
              <CharacterArt name={charB.name} animeId={charB.animeId} imageUrl={charB.imageUrl} eager />
            </Link>
            <div className="min-w-0 flex-1">
              <AnimeBadge animeId={charB.animeId} />
              <Link href={`/characters/${charB.id}`} className="mt-1.5 block font-display text-xl font-bold text-white hover:underline">
                {charB.name}
              </Link>
              <p className="truncate text-xs text-zinc-400">{charB.title}</p>
              {charB.powerLevel !== null && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-300">
                  <Zap className="h-3.5 w-3.5" /> {t.comparisons.powerShort} {charB.powerLevel}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={locked || pending}
            onClick={() => vote("B")}
            className={cn("btn mt-4 w-full", side === "B" ? "btn-primary" : "btn-ghost")}
          >
            {side === "B" && <Check className="h-4 w-4" />}
            {t.comparisons.voteBtn(charB.name, votesB)}
          </button>
        </div>
      </div>

      {/* Split percentage bar */}
      <div className="mt-6">
        <div className="mb-1.5 flex justify-between font-display text-xs font-bold uppercase tracking-wider">
          <span className="text-purple-300">
            {charA.name} · {pctA}%
          </span>
          <span className="text-rose-300">
            {pctB}% · {charB.name}
          </span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
          <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500" style={{ width: `${pctA}%` }} />
          <div className="h-full bg-gradient-to-r from-rose-400 to-rose-600 transition-all duration-500" style={{ width: `${pctB}%` }} />
        </div>
      </div>
    </div>
  );
}
