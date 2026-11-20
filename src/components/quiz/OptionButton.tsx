"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const LETTERS = ["A", "B", "C", "D"];

export type OptionState = "idle" | "chosen" | "correct" | "wrong" | "faded" | "hidden";

/** One answer option. After answering it shows right / wrong; hidden options (50/50) are struck out. */
export function OptionButton({
  index,
  text,
  state,
  disabled,
  onClick,
}: {
  index: number;
  text: string;
  state: OptionState;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || state === "hidden"}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition sm:text-base",
        state === "idle" && "border-white/10 bg-white/5 text-white enabled:hover:border-amber-300/60 enabled:hover:bg-amber-400/10",
        state === "chosen" && "border-amber-300 bg-amber-400/15 text-white",
        state === "correct" && "border-emerald-300 bg-emerald-400/20 text-emerald-50",
        state === "wrong" && "border-rose-400 bg-rose-500/20 text-rose-50",
        state === "faded" && "border-white/5 bg-white/[0.02] text-zinc-500",
        state === "hidden" && "border-white/5 bg-transparent text-zinc-600 line-through",
        disabled && state === "idle" && "cursor-not-allowed opacity-60",
      )}
      data-testid="quiz-option"
      data-index={index}
      data-state={state}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold",
          state === "correct" ? "bg-emerald-400 text-black" : state === "wrong" ? "bg-rose-500 text-white" : "bg-white/10 text-zinc-300",
        )}
      >
        {state === "correct" ? <Check className="h-4 w-4" /> : state === "wrong" ? <X className="h-4 w-4" /> : LETTERS[index]}
      </span>
      <span className="min-w-0 flex-1">{text}</span>
    </button>
  );
}
