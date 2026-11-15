"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { EmptyState } from "@/components/ui/primitives";
import { cn, timeAgo } from "@/lib/utils";

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationsList({ initial }: { initial: NotificationDTO[] }) {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);

  const unread = items.filter((i) => !i.isRead).length;

  async function markAll() {
    setBusy(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isRead: true } : i)));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title={t.notificationsPage.emptyTitle}
        description={t.notificationsPage.emptyDesc}
        action={{ href: "/debates", label: t.notificationsPage.browseDebates }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {unread > 0 && (
        <div className="flex justify-end">
          <button type="button" onClick={markAll} disabled={busy} className="btn btn-ghost !py-2">
            <CheckCheck className="h-4 w-4" /> {t.notificationsPage.markAllRead(unread)}
          </button>
        </div>
      )}

      <div className="space-y-2.5">
        {items.map((n) => {
          const card = (
            <div
              onClick={() => !n.isRead && markOne(n.id)}
              className={cn(
                "glass flex items-start justify-between gap-4 rounded-2xl p-4 transition hover:border-purple-500/40",
                !n.isRead && "neon-border border-purple-500/40",
              )}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {!n.isRead && <span className="h-2 w-2 rounded-full bg-rose-400" />}
                  <span className="font-display text-sm font-bold text-white">{n.title}</span>
                </div>
                <p className="text-sm text-zinc-400">{n.message}</p>
              </div>
              <span className="shrink-0 text-xs text-zinc-500">{timeAgo(new Date(n.createdAt), locale)}</span>
            </div>
          );
          return n.linkUrl ? (
            <Link key={n.id} href={n.linkUrl} className="block">
              {card}
            </Link>
          ) : (
            <div key={n.id}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
