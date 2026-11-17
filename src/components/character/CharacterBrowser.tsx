"use client";

import { useMemo, useState } from "react";
import { Search, SearchX, SlidersHorizontal } from "lucide-react";
import type { CharacterDTO } from "@/game/types";
import { RARITIES, RARITY_INFO, rarityRank, type Rarity } from "@/game/rarity";
import { ENABLED_ANIME } from "@/data/anime";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { RARITY_LABELS } from "@/lib/i18n";
import { CharacterCard } from "./CharacterCard";
import { localizeCharacter } from "@/lib/character-text";

export interface BrowserItem extends CharacterDTO {
  owned?: { copies: number; lastPrice: number; totalSpent: number; acquiredAt: number };
}

type SortKey = "rarity" | "name" | "power" | "anime" | "recent" | "price";

export function CharacterBrowser({
  items,
  mode,
  initialAnime,
}: {
  items: BrowserItem[];
  mode: "database" | "collection";
  initialAnime?: string;
}) {
  const { locale, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [anime, setAnime] = useState<string[]>(initialAnime ? [initialAnime] : []);
  const [rarity, setRarity] = useState<Rarity[]>([]);
  const [sort, setSort] = useState<SortKey>(mode === "collection" ? "recent" : "rarity");

  const localized = useMemo(() => items.map((c) => localizeCharacter(c, locale)), [items, locale]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = localized.filter((c) => {
      if (anime.length && !anime.includes(c.animeId)) return false;
      if (rarity.length && !rarity.includes(c.rarity)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.animeName.toLowerCase().includes(q) ||
        (c.primeForm?.toLowerCase().includes(q) ?? false) ||
        (c.tierCode?.toLowerCase().includes(q) ?? false) ||
        c.abilities.some((a) => a.toLowerCase().includes(q))
      );
    });
    const by: Record<SortKey, (a: BrowserItem, b: BrowserItem) => number> = {
      rarity: (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || (b.powerLevel ?? 0) - (a.powerLevel ?? 0),
      name: (a, b) => a.name.localeCompare(b.name),
      power: (a, b) => (b.powerLevel ?? 0) - (a.powerLevel ?? 0),
      anime: (a, b) => a.animeName.localeCompare(b.animeName) || a.name.localeCompare(b.name),
      recent: (a, b) => (b.owned?.acquiredAt ?? 0) - (a.owned?.acquiredAt ?? 0),
      price: (a, b) => (b.owned?.lastPrice ?? 0) - (a.owned?.lastPrice ?? 0),
    };
    return list.sort(by[sort]);
  }, [localized, query, anime, rarity, sort]);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const sortOptions: { key: SortKey; label: string }[] = [
    ...(mode === "collection"
      ? [
          { key: "recent" as const, label: t.characters.sortRecent },
          { key: "price" as const, label: t.characters.sortPrice },
        ]
      : []),
    { key: "rarity", label: t.characters.sortRarity },
    { key: "power", label: t.characters.sortPower },
    { key: "name", label: t.characters.sortName },
    { key: "anime", label: t.characters.sortAnime },
  ];

  return (
    <div>
      <div className="z-30 mb-6 space-y-4 rounded-2xl border border-white/10 bg-ink-900/95 p-4 shadow-[0_12px_36px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md md:sticky md:top-[4.5rem]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              className="input !pl-10"
              placeholder={t.characters.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t.characters.searchAria}
              data-testid="character-search"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <SlidersHorizontal className="h-4 w-4" />
            <select
              className="input !w-auto !py-2"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label={t.characters.sortAria}
            >
              {sortOptions.map((o) => (
                <option key={o.key} value={o.key} className="bg-ink-900">
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="chip" data-active={anime.length === 0} onClick={() => setAnime([])}>
            {t.characters.allAnime}
          </button>
          {ENABLED_ANIME.map((a) => (
            <button key={a.id} className="chip" data-active={anime.includes(a.id)} onClick={() => setAnime(toggle(anime, a.id))}>
              <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
              {a.shortName}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RARITIES.slice()
            .reverse()
            .map((r) => (
              <button
                key={r}
                className="chip"
                data-active={rarity.includes(r)}
                onClick={() => setRarity(toggle(rarity, r))}
                style={{ color: RARITY_INFO[r].color }}
              >
                {RARITY_LABELS[locale][r]}
              </button>
            ))}
          <span className="ml-auto text-xs text-zinc-500" data-testid="result-count">
            {t.characters.resultCount(filtered.length, items.length)}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass flex flex-col items-center rounded-3xl py-16 text-center">
          <SearchX className="h-10 w-10 text-zinc-500" />
          <p className="mt-3 font-display text-lg text-white">{t.characters.noMatches}</p>
          <button
            className="btn btn-ghost mt-4"
            onClick={() => {
              setQuery("");
              setAnime([]);
              setRarity([]);
            }}
          >
            {t.characters.resetFilters}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              href={`/characters/${c.id}`}
              locale={locale}
              footer={
                c.owned ? (
                  <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-zinc-400">
                    <span>{t.characters.paidLabel(c.owned.lastPrice)}</span>
                    {c.owned.copies > 1 && <span className="rounded bg-purple-500/20 px-1.5 font-semibold text-purple-200">×{c.owned.copies}</span>}
                  </div>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
