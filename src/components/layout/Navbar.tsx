"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Bookmark, Coins, Gavel, Languages, LogOut, Menu, Radio, Shield, User, X } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import { useSocket } from "@/components/providers/SocketProvider";
import { Avatar } from "@/components/ui/Avatar";
import { RankBadge } from "@/components/progression/RankBadge";
import { cn } from "@/lib/utils";

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.location.href = "/";
}

function ActiveMatchBanner() {
  const pathname = usePathname();
  const { active } = useSocket();
  const { t } = useLanguage();

  if (!active || pathname === `/room/${active.code}`) return null;
  return (
    <div className="border-b border-rose-500/30 bg-rose-500/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <span className="flex items-center gap-2 text-rose-100">
          <Radio className="h-4 w-4 shrink-0 animate-pulse text-rose-400" />
          <span>
            <b className="font-display tracking-widest">{active.code}</b> {t.nav.liveMatchBannerPrefix} {t.nav.liveMatchBannerSuffix}
          </span>
        </span>
        <Link href={`/room/${active.code}`} className="btn btn-danger !px-3 !py-1.5 !text-xs">
          {t.nav.returnToMatch}
        </Link>
      </div>
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const { stats, status } = useSocket();
  const { locale, setLocale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const LINKS = [
    { href: "/games", label: t.games.nav, also: ["/play", "/room"] },
    { href: "/debates", label: t.nav.debates },
    { href: "/comparisons", label: t.nav.comparisons },
    { href: "/characters", label: t.nav.characters },
    { href: "/leaderboard", label: t.nav.leaderboard },
  ];

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

  const isStaff = user?.role === "ADMIN" || user?.role === "MODERATOR";
  const nextLocale = locale === "tr" ? "en" : "tr";

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-4">
        <Link href="/" className="group flex shrink-0 items-center gap-2 sm:gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-rose-600 shadow-[0_0_24px_-4px_rgba(168,85,247,0.9)] sm:h-9 sm:w-9">
            <Gavel className="h-4 w-4 text-white transition group-hover:-rotate-12 sm:h-5 sm:w-5" />
          </span>
          <span className="font-display text-base font-bold tracking-wider text-white sm:text-lg">
            ANIME<span className="text-gradient">DEBATE</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => {
            const active =
              pathname === l.href ||
              pathname.startsWith(`${l.href}/`) ||
              ("also" in l && (l.also ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`)));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative whitespace-nowrap shrink-0 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                  active ? "text-white" : "text-zinc-400 hover:text-white",
                )}
              >
                {l.label}
                {active && (
                  <span className="absolute inset-x-2.5 -bottom-[14px] h-0.5 rounded-full bg-gradient-to-r from-purple-500 to-rose-500 shadow-[0_0_10px_rgba(168,85,247,0.9)]" />
                )}
              </Link>
            );
          })}
          {user && (
            <Link
              href="/collection"
              className={cn(
                "relative whitespace-nowrap shrink-0 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                pathname === "/collection" ? "text-white" : "text-zinc-400 hover:text-white",
              )}
            >
              {t.nav.collection}
              {pathname === "/collection" && (
                <span className="absolute inset-x-2.5 -bottom-[14px] h-0.5 rounded-full bg-gradient-to-r from-purple-500 to-rose-500 shadow-[0_0_10px_rgba(168,85,247,0.9)]" />
              )}
            </Link>
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div
            className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 xl:flex"
            title={status === "connected" ? t.nav.liveServerConnected : t.nav.liveServerStatus}
          >
            <span className={cn("h-2 w-2 rounded-full", status === "connected" ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400")} />
            {stats ? `${stats.online} ${t.nav.onlineSuffix}` : t.nav.liveFallback}
          </div>

          <button
            type="button"
            onClick={() => setLocale(nextLocale)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 text-xs font-display font-semibold uppercase tracking-wider text-zinc-200 transition hover:border-purple-400/50 hover:text-white"
            title={locale === "tr" ? "Switch to English" : "Türkçeye geç"}
            aria-label={locale === "tr" ? "Switch to English" : "Türkçeye geç"}
            data-testid="language-switcher"
          >
            <Languages className="h-3.5 w-3.5 text-purple-300" />
            <span>{locale.toUpperCase()}</span>
          </button>

          {user ? (
            <>
              <Link
                href="/favorites"
                className={cn(
                  "hidden h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:border-purple-400/50 hover:text-white sm:flex",
                  pathname === "/favorites" && "border-purple-400/60 text-amber-300",
                )}
                title={t.nav.favorites}
                aria-label={t.nav.favorites}
              >
                <Bookmark className="h-4 w-4" />
              </Link>

              <Link
                href="/notifications"
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:border-purple-400/50 hover:text-white",
                  pathname === "/notifications" && "border-purple-400/60 text-purple-200",
                )}
                title={t.nav.notifications}
                aria-label={t.nav.notifications}
              >
                <Bell className="h-4 w-4" />
                {user.unreadNotifications > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {user.unreadNotifications > 9 ? "9+" : user.unreadNotifications}
                  </span>
                )}
              </Link>

              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenu((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 transition hover:border-purple-400/50"
                  aria-haspopup="menu"
                  aria-expanded={menu}
                >
                  <Avatar username={user.username} style={user.avatarStyle} imageUrl={user.avatarImage} size={30} />
                  <span className="hidden max-w-[110px] truncate text-sm font-medium text-white sm:block">{user.username}</span>
                  <span className="hidden rounded-full bg-purple-500/20 px-1.5 py-0.5 font-display text-[10px] font-bold text-purple-200 sm:inline">
                    {t.nav.levelShort}.{user.level}
                  </span>
                </button>
                {menu && (
                  <div role="menu" className="glass-strong absolute right-0 mt-2 w-56 overflow-hidden rounded-xl p-1 animate-pop-in">
                    <Link href="/ranks" className="mb-1 block rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 hover:bg-white/10" role="menuitem" data-testid="nav-progress">
                      <div className="flex items-center justify-between gap-2">
                        <RankBadge level={user.level} locale={locale} size="xs" />
                        <span className="flex items-center gap-1 font-display text-xs font-bold text-amber-200" data-testid="nav-coins">
                          <Coins className="h-3.5 w-3.5" /> {user.coins} {t.progression.coinsShort}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-400">{t.progression.ranksLink}</div>
                    </Link>
                    <Link href={`/profile/${user.username}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-white/10" role="menuitem">
                      <User className="h-4 w-4" /> {t.nav.myProfile}
                    </Link>
                    <Link href="/favorites" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-white/10" role="menuitem">
                      <Bookmark className="h-4 w-4" /> {t.nav.favorites}
                    </Link>
                    <Link href="/collection" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-white/10" role="menuitem">
                      <Gavel className="h-4 w-4" /> {t.nav.collectionHistory}
                    </Link>
                    {isStaff && (
                      <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/15" role="menuitem">
                        <Shield className="h-4 w-4" /> {t.nav.adminPanel}
                      </Link>
                    )}
                    <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-200 hover:bg-rose-500/15" role="menuitem">
                      <LogOut className="h-4 w-4" /> {t.nav.logout}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn btn-ghost !py-2">
                {t.nav.login}
              </Link>
              <Link href="/register" className="btn btn-primary !py-2">
                {t.nav.signup}
              </Link>
            </div>
          )}

          <button className="rounded-lg p-2 text-zinc-300 lg:hidden" onClick={() => setOpen((v) => !v)} aria-label={t.nav.toggleMenu}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="max-h-[calc(100svh-4rem)] overflow-y-auto border-t border-white/5 bg-ink-950/95 px-4 py-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-zinc-200 hover:bg-white/5">
                {l.label}
              </Link>
            ))}
            {user && (
              <>
                <Link href="/collection" className="rounded-lg px-3 py-2 text-zinc-200 hover:bg-white/5">
                  {t.nav.collection}
                </Link>
                <Link href="/favorites" className="rounded-lg px-3 py-2 text-zinc-200 hover:bg-white/5">
                  {t.nav.favorites}
                </Link>
                {isStaff && (
                  <Link href="/admin" className="rounded-lg px-3 py-2 text-amber-200 hover:bg-amber-500/10">
                    {t.nav.adminPanel}
                  </Link>
                )}
              </>
            )}
            {!user && (
              <div className="mt-2 flex gap-2">
                <Link href="/login" className="btn btn-ghost flex-1">
                  {t.nav.login}
                </Link>
                <Link href="/register" className="btn btn-primary flex-1">
                  {t.nav.signup}
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
