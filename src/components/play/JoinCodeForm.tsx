"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@/game/config";
import { normalizeRoomCode } from "@/game/rules";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { FormError } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function JoinCodeForm({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setError(t.play.invalidCodeMsg(ROOM_CODE_LENGTH));
      return;
    }
    router.push(`/room/${normalized}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className={cn("flex gap-2", !compact && "flex-col sm:flex-row")}>
        <input
          className={cn("input text-center font-display font-bold uppercase tracking-[0.4em]", compact ? "text-lg" : "!py-4 text-3xl")}
          value={code}
          onChange={(e) => {
            setError(null);
            setCode(
              e.target.value
                .toUpperCase()
                .split("")
                .filter((c) => ROOM_CODE_ALPHABET.includes(c))
                .join("")
                .slice(0, ROOM_CODE_LENGTH),
            );
          }}
          placeholder="ABC123"
          aria-label={t.play.roomCodeAria}
          autoComplete="off"
          spellCheck={false}
          data-testid="join-code-input"
        />
        <button type="submit" className={cn("btn btn-primary shrink-0", !compact && "!py-4")} disabled={code.length !== ROOM_CODE_LENGTH} data-testid="join-code-submit">
          {t.play.joinBtn} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <FormError message={error} />
    </form>
  );
}
