"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pin, ShieldAlert, Trash2, Unlock } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";

export function ModerationActions({
  targetType,
  targetId,
  status,
  isPinned = false,
  isAuthor,
  isStaff,
  redirectAfterDelete,
}: {
  targetType: "DEBATE" | "COMPARISON";
  targetId: string;
  status: string;
  isPinned?: boolean;
  isAuthor: boolean;
  isStaff: boolean;
  redirectAfterDelete: string;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  if (!isAuthor && !isStaff) return null;

  async function moderate(action: "PIN" | "UNPIN" | "LOCK" | "OPEN" | "HIDE" | "DELETE") {
    if (busy) return;
    setBusy(true);
    try {
      if (action === "DELETE" && isAuthor && !isStaff) {
        const endpoint = targetType === "DEBATE" ? `/api/debates/${targetId}` : `/api/comparisons/${targetId}`;
        const res = await fetch(endpoint, { method: "DELETE" });
        if (res.ok) {
          router.push(redirectAfterDelete);
          router.refresh();
        }
        return;
      }
      const res = await fetch("/api/admin/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, action }),
      });
      if (res.ok) {
        if (action === "DELETE") router.push(redirectAfterDelete);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isStaff && targetType === "DEBATE" && (
        <button
          type="button"
          onClick={() => moderate(isPinned ? "UNPIN" : "PIN")}
          disabled={busy}
          className="btn btn-ghost !px-3 !py-1.5 !text-xs"
        >
          <Pin className="h-3.5 w-3.5" />
          {isPinned ? t.community.unpin : t.community.pin}
        </button>
      )}
      {isStaff && (
        <button
          type="button"
          onClick={() => moderate(status === "LOCKED" ? "OPEN" : "LOCK")}
          disabled={busy}
          className="btn btn-ghost !px-3 !py-1.5 !text-xs"
        >
          {status === "LOCKED" ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {status === "LOCKED" ? t.community.unlock : t.community.lock}
        </button>
      )}
      {isStaff && status !== "HIDDEN" && (
        <button
          type="button"
          onClick={() => moderate("HIDE")}
          disabled={busy}
          className="btn btn-ghost !px-3 !py-1.5 !text-xs text-amber-200"
        >
          <ShieldAlert className="h-3.5 w-3.5" /> {t.community.hide}
        </button>
      )}
      <button
        type="button"
        onClick={() => moderate("DELETE")}
        disabled={busy}
        className="btn btn-danger !px-3 !py-1.5 !text-xs"
      >
        <Trash2 className="h-3.5 w-3.5" /> {t.community.delete}
      </button>
    </div>
  );
}
