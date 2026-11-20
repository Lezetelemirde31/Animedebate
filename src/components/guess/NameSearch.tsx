"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAnime } from "@/data/anime";
import { searchKey } from "@/game/guess/rules";

export interface NameOption {
  id: string;
  name: string;
  animeId: string;
}

/**
 * Character name picker: type part of a name, choose from the suggestions
 * (arrow keys + Enter, or tap). Guesses are always a real character.
 */
export function NameSearch({
  options,
  exclude,
  disabled,
  placeholder,
  noMatch,
  onPick,
}: {
  options: NameOption[];
  exclude: string[];
  disabled?: boolean;
  placeholder: string;
  noMatch: string;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const indexed = useMemo(() => options.map((o) => ({ ...o, key: searchKey(o.name) })), [options]);

  const results = useMemo(() => {
    const k = searchKey(q);
    if (!k) return [];
    const skip = new Set(exclude);
    const scored: { o: (typeof indexed)[number]; s: number }[] = [];
    for (const o of indexed) {
      if (skip.has(o.id)) continue;
      let s = -1;
      if (o.key.startsWith(k)) s = 0;
      else if (o.key.split(" ").some((w) => w.startsWith(k))) s = 1;
      else if (o.key.includes(k)) s = 2;
      if (s >= 0) scored.push({ o, s });
    }
    return scored
      .sort((a, b) => a.s - b.s || a.o.name.localeCompare(b.o.name))
      .slice(0, 8)
      .map((x) => x.o);
  }, [q, indexed, exclude]);

  function pick(id: string) {
    onPick(id);
    setQ("");
    setActive(0);
    setOpen(false);
    input.current?.focus();
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
      <input
        ref={input}
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (results[active]) pick(results[active].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        className="input w-full py-3 pl-9 text-base"
        data-testid="guess-input"
      />
      {open && q.trim() && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500">{noMatch}</li>
          ) : (
            results.map((o, i) => {
              const anime = getAnime(o.animeId);
              return (
                <li key={o.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o.id)}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm", i === active ? "bg-lime-400/15 text-white" : "text-zinc-200")}
                    data-testid="guess-option"
                    data-id={o.id}
                  >
                    <span className="truncate font-semibold">{o.name}</span>
                    <span className="shrink-0 text-[11px]" style={{ color: anime?.color }}>
                      {anime?.shortName}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
