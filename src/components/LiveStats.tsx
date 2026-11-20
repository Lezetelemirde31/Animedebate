"use client";

import { DoorOpen, Radar, Swords, Users } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { useSocket } from "@/components/providers/SocketProvider";

export function LiveStats() {
  const { stats, status } = useSocket();
  const { t } = useLanguage();
  const items = [
    { label: t.liveStats.onlineNow, value: stats?.online, icon: Users, color: "text-emerald-300" },
    { label: t.liveStats.liveAuctions, value: stats?.liveMatches, icon: Swords, color: "text-rose-300" },
    { label: t.liveStats.searching, value: stats?.inQueue, icon: Radar, color: "text-purple-300" },
    { label: t.liveStats.openRooms, value: stats?.openRooms, icon: DoorOpen, color: "text-sky-300" },
  ];
  return (
    <div className="glass grid grid-cols-2 gap-px overflow-hidden rounded-2xl md:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-3 bg-ink-950/40 px-5 py-4">
          <i.icon className={`h-5 w-5 ${i.color}`} />
          <div>
            <div className="font-display text-2xl font-bold text-white tabular-nums">{i.value ?? (status === "connected" ? 0 : "…")}</div>
            <div className="text-[11px] uppercase tracking-widest text-zinc-500">{i.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
