"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Gavel, LogOut, Menu, Radio, User, X } from "lucide-react";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import { emitWithAck, useSocket } from "@/components/providers/SocketProvider";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/play", label: "Play" },
  { href: "/characters", label: "Characters" },
  { href: "/collection", label: "Collection" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/history", label: "History" },
];

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.location.href = "/";
}

function ActiveMatchBanner() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const { socket, status } = useSocket();
  const [active, setActive] = useState<{ code: string; phase: string } | null>(null);

  useEffect(() => {
    if (!user || status !== "connected") return;
    let cancelled = false;
    emitWithAck<{ ok: boolean; data?: { code: string | null; phase: string | null } }>(socket, (s, ack) =>
      s.emit("me:active", ack as never),
    )
      .then((res) => {
        if (cancelled) return;
        const d = res.ok ? res.data : undefined;
        setActive(d?.code && d.phase && d.phase !== "LOBBY" ? { code: d.code, phase: d.phase } : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname, socket, status, user]);

  if (!active || pathname === `/room/${active.code}`) return null;
  return (
    <div className="border-b border-rose-500/30 bg-rose-500/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <span className="flex items-center gap-2 text-rose-100">
          <Radio className="h-4 w-4 animate-pulse text-rose-400" />
          Your auction in room <b className="font-display tracking-widest">{active.code}</b> is still live.
        </span>
        <Link href={`/room/${active.code}`} className="btn btn-danger !px-3 !py-1.5 !text-xs">
          Return to match
        </Link>
      </div>
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const { stats, status } = useSocket();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-rose-600 shadow-[0_0_24px_-4px_rgba(168,85,247,0.9)]">
            <Gavel className="h-5 w-5 text-white transition group-hover:-rotate-12" />
          </span>
          <span className="font-display text-lg font-bold tracking-wider text-white">
            ANIME<span className="text-gradient">AUCTION</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative rounded-lg px-3 py-2 text-sm font-medium transition",
                  active ? "text-white" : "text-zinc-400 hover:text-white",
                )}
              >
                {l.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-gradient-to-r from-purple-500 to-rose-500 shadow-[0_0_10px_rgba(168,85,247,0.9)]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div
            className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 sm:flex"
            title={status === "connected" ? "Connected to the live server" : "Connecting to the live server…"}
          >
            <span className={cn("h-2 w-2 rounded-full", status === "connected" ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400 animate-pulse")} />
            {stats ? `${stats.online} online` : "Connecting…"}
          </div>

          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenu((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 transition hover:border-purple-400/50"
                aria-haspopup="menu"
                aria-expanded={menu}
              >
                <Avatar username={user.username} style={user.avatarStyle} imageUrl={user.avatarImage} size={30} />
                <span className="hidden max-w-[120px] truncate text-sm font-medium text-white sm:block">{user.username}</span>
              </button>
              {menu && (
                <div role="menu" className="glass-strong absolute right-0 mt-2 w-48 overflow-hidden rounded-xl p-1 animate-pop-in">
                  <Link href={`/profile/${user.username}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-white/10" role="menuitem">
                    <User className="h-4 w-4" /> My profile
                  </Link>
                  <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-200 hover:bg-rose-500/15" role="menuitem">
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn btn-ghost !py-2">
                Log in
              </Link>
              <Link href="/register" className="btn btn-primary !py-2">
                Sign up
              </Link>
            </div>
          )}

          <button className="rounded-lg p-2 text-zinc-300 md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-white/5 px-4 py-3 md:hidden animate-slide-up">
          <div className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-zinc-200 hover:bg-white/5">
                {l.label}
              </Link>
            ))}
            {!user && (
              <div className="mt-2 flex gap-2">
                <Link href="/login" className="btn btn-ghost flex-1">
                  Log in
                </Link>
                <Link href="/register" className="btn btn-primary flex-1">
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </nav>
      )}
      <ActiveMatchBanner />
    </header>
  );
}
