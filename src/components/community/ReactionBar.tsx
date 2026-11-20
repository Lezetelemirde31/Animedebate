"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReactionBar({
  targetType,
  targetId,
  initialLikes,
  initialDislikes,
  initialValue,
  signedIn,
  size = "md",
}: {
  targetType: "DEBATE" | "COMPARISON" | "COMMENT";
  targetId: string;
  initialLikes: number;
  initialDislikes: number;
  initialValue: number | null;
  signedIn: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [value, setValue] = useState<number | null>(initialValue);
  const [pending, setPending] = useState(false);

  async function react(next: 1 | -1) {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, value: next }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        value?: number | null;
        likesCount?: number;
        dislikesCount?: number;
      } | null;
      if (res.ok && data?.ok) {
        setValue(data.value ?? null);
        if (typeof data.likesCount === "number") setLikes(data.likesCount);
        if (typeof data.dislikesCount === "number") setDislikes(data.dislikesCount);
      }
    } finally {
      setPending(false);
    }
  }

  const pad = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-xs";

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => react(1)}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border font-medium transition",
          pad,
          value === 1
            ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
            : "border-white/10 bg-white/5 text-zinc-300 hover:border-emerald-400/40 hover:text-white",
        )}
        aria-pressed={value === 1}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        <span className="tabular-nums">{likes}</span>
      </button>
      <button
        type="button"
        onClick={() => react(-1)}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border font-medium transition",
          pad,
          value === -1
            ? "border-rose-400/60 bg-rose-500/15 text-rose-200"
            : "border-white/10 bg-white/5 text-zinc-300 hover:border-rose-400/40 hover:text-white",
        )}
        aria-pressed={value === -1}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        <span className="tabular-nums">{dislikes}</span>
      </button>
    </div>
  );
}
