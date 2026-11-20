"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Swords } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { FormError, Spinner } from "@/components/ui/primitives";

export function CreateComparisonForm({
  characters,
}: {
  characters: { id: string; name: string; animeName: string }[];
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [characterAId, setCharacterAId] = useState(characters[0]?.id ?? "");
  const [characterBId, setCharacterBId] = useState(characters[1]?.id ?? "");
  const [criteria, setCriteria] = useState<string>("COMBAT");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const CRITERIA = [
    { id: "COMBAT", label: t.comparisons.criteria.COMBAT },
    { id: "OVERALL", label: t.comparisons.criteria.OVERALL },
    { id: "WRITING", label: t.comparisons.criteria.WRITING },
    { id: "INTELLIGENCE", label: t.comparisons.criteria.INTELLIGENCE },
  ] as const;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterAId, characterBId, criteria, title, description }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        comparison?: { slug: string };
      } | null;
      if (!res.ok || !data?.ok || !data.comparison) {
        setError(data?.error ?? t.comparisons.createError);
        setLoading(false);
        return;
      }
      router.push(`/comparisons/${data.comparison.slug}`);
      router.refresh();
    } catch {
      setError(t.comparisons.networkError);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="glass-strong mx-auto max-w-3xl space-y-5 rounded-3xl p-6 md:p-8 neon-border animate-slide-up">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-200">
          <Swords className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-xl font-bold text-white">{t.comparisons.formHeading}</h2>
          <p className="text-xs text-zinc-400">{t.comparisons.formSubheading}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-purple-300">{t.comparisons.contenderA}</span>
          <select className="input" value={characterAId} onChange={(e) => setCharacterAId(e.target.value)}>
            {characters.map((c) => (
              <option key={c.id} value={c.id} className="bg-ink-900">
                {c.name} ({c.animeName})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-rose-300">{t.comparisons.contenderB}</span>
          <select className="input" value={characterBId} onChange={(e) => setCharacterBId(e.target.value)}>
            {characters.map((c) => (
              <option key={c.id} value={c.id} className="bg-ink-900">
                {c.name} ({c.animeName})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.comparisons.matchupTitle}</span>
          <input
            className="input"
            placeholder={t.comparisons.matchupTitlePlaceholder}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.comparisons.criteriaLabel}</span>
          <select className="input" value={criteria} onChange={(e) => setCriteria(e.target.value)}>
            {CRITERIA.map((c) => (
              <option key={c.id} value={c.id} className="bg-ink-900">
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.comparisons.rulesLabel}</span>
        <textarea
          className="input min-h-[120px]"
          placeholder={t.comparisons.rulesPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          required
        />
      </label>

      <FormError message={error} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="btn btn-ghost">
          {t.debates.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <Spinner className="h-4 w-4 text-white" /> : <Swords className="h-4 w-4" />}
          {t.comparisons.launchBtn}
        </button>
      </div>
    </form>
  );
}
