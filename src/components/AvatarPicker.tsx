"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Palette } from "lucide-react";
import { AVATAR_STYLES, avatarGradient } from "@/lib/avatars";
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
      setError(data?.error ?? "Could not update your profile picture.");
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn btn-ghost !py-2" onClick={() => setOpen(true)}>
        <Palette className="h-4 w-4" /> Change picture
      </button>
    );
  }

  return (
    <div className="glass-strong w-full rounded-2xl p-5 animate-slide-up">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">Profile picture</h3>
        <button className="text-xs text-zinc-400 hover:text-white" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="mb-2 text-xs text-zinc-400">Colour emblem</div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(AVATAR_STYLES).map(([id, s]) => {
          const active = !currentCharacterId && currentStyle === id;
          return (
            <button
              key={id}
              title={s.label}
              onClick={() => update({ avatarStyle: id, avatarCharacterId: null }, id)}
              className={cn("relative h-11 w-11 rounded-full ring-2 transition", active ? "ring-white" : "ring-transparent hover:ring-white/40")}
              style={{ background: avatarGradient(id) }}
              aria-label={s.label}
            >
              {pending === id ? <Spinner className="mx-auto h-4 w-4 text-white" /> : active ? <Check className="mx-auto h-4 w-4 text-white" /> : null}
            </button>
          );
        })}
      </div>
      <div className="mb-2 mt-5 text-xs text-zinc-400">Or wear a character from your collection</div>
      {owned.length === 0 ? (
        <p className="text-sm text-zinc-500">Win characters at auction to unlock them as profile pictures.</p>
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
