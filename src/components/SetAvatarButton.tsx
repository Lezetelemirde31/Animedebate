"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, UserCircle2 } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { Spinner } from "@/components/ui/primitives";

export function SetAvatarButton({ characterId, active }: { characterId: string; active: boolean }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarCharacterId: active ? null : characterId }),
    }).catch(() => null);
    setPending(false);
    if (!res || !res.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? t.characters.avatarError);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button className="btn btn-ghost" onClick={apply} disabled={pending}>
        {pending ? <Spinner className="h-4 w-4" /> : active ? <Check className="h-4 w-4 text-emerald-300" /> : <UserCircle2 className="h-4 w-4" />}
        {active ? t.characters.removeAvatar : t.characters.useAvatar}
      </button>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
