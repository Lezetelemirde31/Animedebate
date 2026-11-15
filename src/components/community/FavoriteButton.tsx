"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  targetType,
  targetId,
  initialFavorited,
  signedIn,
  compact = false,
}: {
  targetType: "CHARACTER" | "DEBATE" | "COMPARISON";
  targetId: string;
  initialFavorited: boolean;
  signedIn: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    if (pending) return;
    setPending(true);
    const prev = favorited;
    setFavorited(!prev);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; favorited?: boolean } | null;
      if (!res.ok || !data?.ok) {
        setFavorited(prev);
      } else {
        setFavorited(Boolean(data.favorited));
      }
    } catch {
      setFavorited(prev);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        favorited
          ? "border-amber-400/60 bg-amber-500/15 text-amber-200 shadow-[0_0_16px_-6px_rgba(251,191,36,0.7)]"
          : "border-white/10 bg-white/5 text-zinc-300 hover:border-purple-400/40 hover:text-white",
      )}
      aria-pressed={favorited}
    >
      <Bookmark className={cn("h-3.5 w-3.5", favorited && "fill-amber-300 text-amber-300")} />
      {!compact && <span>{favorited ? t.community.saved : t.community.favorite}</span>}
    </button>
  );
}
