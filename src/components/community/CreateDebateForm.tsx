"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Send } from "lucide-react";
import { ENABLED_ANIME } from "@/data/anime";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { FormError, Spinner } from "@/components/ui/primitives";

export function CreateDebateForm({
  characters,
  defaultCharacterId = "",
}: {
  characters: { id: string; name: string; animeId: string }[];
  defaultCharacterId?: string;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("POWER_SCALING");
  const [animeId, setAnimeId] = useState<string>("");
  const [characterId, setCharacterId] = useState<string>(defaultCharacterId);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const CATEGORIES = [
    { id: "GENERAL", label: t.debates.categories.GENERAL },
    { id: "POWER_SCALING", label: t.debates.categories.POWER_SCALING },
    { id: "LORE", label: t.debates.categories.LORE },
    { id: "HOT_TAKE", label: t.debates.categories.HOT_TAKE },
  ] as const;

  const filteredChars = animeId ? characters.filter((c) => c.animeId === animeId) : characters;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/debates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          animeId: animeId || null,
          characterId: characterId || null,
          content,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        debate?: { slug: string };
      } | null;
      if (!res.ok || !data?.ok || !data.debate) {
        setError(data?.error ?? t.debates.createError);
        setLoading(false);
        return;
      }
      router.push(`/debates/${data.debate.slug}`);
      router.refresh();
    } catch {
      setError(t.debates.networkError);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="glass-strong mx-auto max-w-3xl space-y-5 rounded-3xl p-6 md:p-8 neon-border animate-slide-up">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300">
          <Flame className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-xl font-bold text-white">{t.debates.formHeading}</h2>
          <p className="text-xs text-zinc-400">{t.debates.formSubheading}</p>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.debates.titleLabel}</span>
        <input
          className="input"
          placeholder={t.debates.titlePlaceholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          required
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.debates.categoryLabel}</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id} className="bg-ink-900">
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.debates.animeOptional}</span>
          <select
            className="input"
            value={animeId}
            onChange={(e) => {
              setAnimeId(e.target.value);
              setCharacterId("");
            }}
          >
            <option value="" className="bg-ink-900">
              {t.debates.allAnime}
            </option>
            {ENABLED_ANIME.map((a) => (
              <option key={a.id} value={a.id} className="bg-ink-900">
                {a.shortName}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.debates.characterOptional}</span>
          <select className="input" value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="" className="bg-ink-900">
              {t.debates.noneOption}
            </option>
            {filteredChars.map((c) => (
              <option key={c.id} value={c.id} className="bg-ink-900">
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.debates.openingArg}</span>
        <textarea
          className="input min-h-[160px]"
          placeholder={t.debates.openingArgPlaceholder}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={5000}
          required
        />
      </label>

      <FormError message={error} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="btn btn-ghost">
          {t.debates.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}
          {t.debates.publish}
        </button>
      </div>
    </form>
  );
}
