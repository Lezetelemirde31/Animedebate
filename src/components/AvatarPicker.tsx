"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Palette, Trash2 } from "lucide-react";
import { AVATAR_STYLES, avatarGradient } from "@/lib/avatars";
import { AVATAR_LABELS } from "@/lib/i18n";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { FormError, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** Upload limit enforced by the server (Vercel caps request bodies at 4.5 MB). */
const MAX_UPLOAD = 4 * 1024 * 1024;

/**
 * Shrinks big still photos in the browser before uploading (phone photos are
 * often 5–15 MB). GIFs are sent untouched so they stay animated; the server
 * re-encodes everything to a 256×256 WebP either way.
 */
async function prepareUpload(file: File): Promise<Blob> {
  if (file.type === "image/gif" || file.size <= 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file; // e.g. a format the browser can't decode: let the server decide
  }
}

export function AvatarPicker({
  currentStyle,
  currentCharacterId,
  customUrl,
  owned,
}: {
  currentStyle: string;
  currentCharacterId: string | null;
  customUrl?: string | null;
  owned: { id: string; name: string; imageUrl: string | null }[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
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

  async function upload(file: File) {
    setPending("upload");
    setError(null);
    const blob = await prepareUpload(file);
    if (blob.size > MAX_UPLOAD) {
      setPending(null);
      setError(t.profile.uploadHint);
      return;
    }
    const form = new FormData();
    form.append("file", blob, file.name);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: form }).catch(() => null);
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? t.profile.avatarUpdateError);
      return;
    }
    router.refresh();
  }

  async function removeUpload() {
    setPending("remove");
    setError(null);
    const res = await fetch("/api/profile/avatar", { method: "DELETE" }).catch(() => null);
    setPending(null);
    if (!res?.ok) {
      setError(t.profile.avatarUpdateError);
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
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          {customUrl && (
            <img src={customUrl} alt={t.profile.yourPhoto} className="h-14 w-14 rounded-full object-cover ring-2 ring-purple-400" />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
            data-testid="avatar-file-input"
          />
          <button
            type="button"
            className="btn btn-primary !py-2"
            onClick={() => fileRef.current?.click()}
            disabled={pending !== null}
            data-testid="avatar-upload-btn"
          >
            {pending === "upload" ? <Spinner className="h-4 w-4 text-white" /> : <ImagePlus className="h-4 w-4" />}
            {pending === "upload" ? t.profile.uploading : t.profile.uploadFromGallery}
          </button>
          {customUrl && (
            <button type="button" className="btn btn-ghost !py-2" onClick={() => void removeUpload()} disabled={pending !== null}>
              {pending === "remove" ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} {t.profile.removePhoto}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-500">{t.profile.uploadHint}</p>
      </div>
      <div className="mb-2 text-xs text-zinc-400">{t.profile.colourEmblem}</div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(AVATAR_STYLES).map(([id, s]) => {
          const active = !customUrl && !currentCharacterId && currentStyle === id;
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
            const active = !customUrl && currentCharacterId === c.id;
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
