"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Palette } from "lucide-react";
import { AVATAR_STYLES, avatarGradient } from "@/lib/avatars";
import { AVATAR_LABELS } from "@/lib/i18n";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { FormError, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function AvatarPicker({
  currentStyle,
  currentCharacterId,
  owned,
}: {
  currentStyle: string;
  currentCharacterId: string | null;
  owned: { id: string; name: string; imageUrl: string | null }[];
}) {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(body: { avatarStyle?: string; avatarCharacterId?: string | null }, key: string) {
    setPending(key);
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setPending(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? t.profile.avatarUpdateError);
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn btn-ghost !py-2" onClick={() => setOpen(true)}>
        <Palette className="h-4 w-4" /> {t.profile.changePictureBtn}
      </button>
    );
  }

  return (
    <div className="glass-strong w-full rounded-2xl p-5 animate-slide-up">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">{t.profile.profilePictureTitle}</h3>
        <button className="text-xs text-zinc-400 hover:text-white" onClick={() => setOpen(false)}>
          {t.profile.close}
        </button>
      </div>
      <div className="mb-2 text-xs text-zinc-400">{t.profile.colourEmblem}</div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(AVATAR_STYLES).map(([id, s]) => {
          const active = !currentCharacterId && currentStyle === id;
          const label = AVATAR_LABELS[locale][id] ?? s.label;
          return (
            <button
              key={id}
              title={label}
              onClick={() => update({ avatarStyle: id, avatarCharacterId: null }, id)}
              className={cn("relative h-11 w-11 rounded-full ring-2 transition", active ? "ring-white" : "ring-transparent hover:ring-white/40")}
              style={{ background: avatarGradient(id) }}
              aria-label={label}
            >
              {pending === id ? <Spinner className="mx-auto h-4 w-4 text-white" /> : active ? <Check className="mx-auto h-4 w-4 text-white" /> : null}
            </button>
          );
        })}
      </div>
      <div className="mb-2 mt-5 text-xs text-zinc-400">{t.profile.wearCharacter}</div>
      {owned.length === 0 ? (
        <p className="text-sm text-zinc-500">{t.profile.noOwnedForAvatar}</p>
      ) : (
        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
          {owned.map((c) => {
            const active = currentCharacterId === c.id;
            return (
              <button
                key={c.id}
                title={c.name}
                onClick={() => update({ avatarCharacterId: c.id }, c.id)}
                className={cn("relative h-12 w-12 overflow-hidden rounded-full ring-2 transition", active ? "ring-purple-400" : "ring-white/10 hover:ring-white/40")}
              >
                {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="h-full w-full object-cover object-top" /> : <span className="text-xs">{c.name[0]}</span>}
                {pending === c.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <Spinner className="h-4 w-4" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-3">
        <FormError message={error} />
      </div>
    </div>
  );
}
