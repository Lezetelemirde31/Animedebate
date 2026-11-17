"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Gavel,
  Loader2,
  Lock,
  ShieldCheck,
  Swords,
  Trophy,
  User,
  XCircle,
} from "lucide-react";
import { CharacterArt } from "@/components/character/CharacterArt";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { Avatar } from "@/components/ui/Avatar";
import { FormError, Spinner } from "@/components/ui/primitives";
import type { Rarity } from "@prisma/client";
import { RARITY_INFO } from "@/game/rarity";
import { AVATAR_STYLES, avatarGradient, type AvatarStyleId } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { USERNAME_REGEX } from "@/lib/validation";

export interface AuthShowcaseCharacter {
  id: string;
  name: string;
  animeId: string;
  animeName: string;
  imageUrl: string | null;
  rarity: Rarity;
}

type AuthMode = "login" | "register";
type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

function safeNext(next: string | undefined): string {
  // Only allow same-site relative redirects.
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/play";
  return next;
}

function evaluatePassword(password: string) {
  const hasMinLength = password.length >= 8;
  const hasUpperLower = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumberOrSymbol = /[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password);
  const isLong = password.length >= 12;

  let level: 0 | 1 | 2 | 3 | 4 = 0;
  if (password.length > 0) {
    if (!hasMinLength) {
      level = 1;
    } else {
      const extras = (hasUpperLower ? 1 : 0) + (hasNumberOrSymbol ? 1 : 0) + (isLong ? 1 : 0);
      level = extras === 0 ? 2 : extras === 1 ? 3 : 4;
    }
  }

  return {
    level,
    hasMinLength,
    hasUpperLower,
    hasNumberOrSymbol,
  };
}

export function AuthForm({
  mode: initialMode,
  next,
  featuredCharacters = [],
  totalCharacters = 48,
  animeCount = 6,
}: {
  mode: AuthMode;
  next?: string;
  featuredCharacters?: AuthShowcaseCharacter[];
  totalCharacters?: number;
  animeCount?: number;
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyleId>("violet");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [usernameReason, setUsernameReason] = useState<string | null>(null);

  const isLogin = mode === "login";
  const trimmedUsername = username.trim();

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  function switchMode(nextMode: AuthMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError(null);
    if (typeof window !== "undefined") {
      const query = next ? `?next=${encodeURIComponent(next)}` : "";
      window.history.replaceState(null, "", `/${nextMode}${query}`);
    }
  }

  // Live debounced username validation + availability check in Register mode
  useEffect(() => {
    if (isLogin) {
      setUsernameStatus("idle");
      setUsernameReason(null);
      return;
    }
    if (!trimmedUsername) {
      setUsernameStatus("idle");
      setUsernameReason(null);
      return;
    }
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20 || !USERNAME_REGEX.test(trimmedUsername)) {
      setUsernameStatus("invalid");
      setUsernameReason(t.auth.usernameInvalid);
      return;
    }

    setUsernameStatus("checking");
    setUsernameReason(null);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(trimmedUsername)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setUsernameStatus("idle");
          return;
        }
        const data = (await res.json()) as { valid?: boolean; available?: boolean; reason?: string | null };
        if (controller.signal.aborted) return;
        if (!data.valid) {
          setUsernameStatus("invalid");
          setUsernameReason(data.reason ?? t.auth.usernameInvalid);
        } else if (data.available) {
          setUsernameStatus("available");
          setUsernameReason(null);
        } else {
          setUsernameStatus("taken");
          setUsernameReason(data.reason ?? t.auth.usernameTaken);
        }
      } catch {
        if (!controller.signal.aborted) {
          setUsernameStatus("idle");
        }
      }
    }, 320);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [isLogin, trimmedUsername, t.auth.usernameInvalid, t.auth.usernameTaken]);

  const strength = useMemo(() => evaluatePassword(password), [password]);
  const passwordsMatch = !isLogin && confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = !isLogin && confirmPassword.length > 0 && password !== confirmPassword;

  function handleKeyModifiers(e: React.KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === "function") {
      setCapsLockOn(e.getModifierState("CapsLock"));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!trimmedUsername) {
      setError(t.auth.usernameInvalid);
      return;
    }

    if (!password) {
      setError(isLogin ? t.auth.passwordPlaceholderLogin : t.auth.passwordPlaceholderReg);
      return;
    }

    if (!isLogin) {
      if (trimmedUsername.length < 3 || trimmedUsername.length > 20 || !USERNAME_REGEX.test(trimmedUsername)) {
        setError(t.auth.usernameInvalid);
        return;
      }
      if (usernameStatus === "taken") {
        setError(t.auth.usernameTaken);
        return;
      }
      if (password.length < 8) {
        setError(t.auth.passwordPlaceholderReg);
        return;
      }
      if (password !== confirmPassword) {
        setError(t.auth.passwordsMismatch);
        return;
      }
    }

    setLoading(true);
    try {
      const payload = isLogin
        ? { username: trimmedUsername, password }
        : { username: trimmedUsername, password, avatarStyle };

      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? t.auth.genericError);
        setLoading(false);
        return;
      }
      // Full navigation so the live connection re-authenticates with the new session.
      window.location.href = safeNext(next);
    } catch {
      setError(t.auth.networkError);
      setLoading(false);
    }
  }

  const strengthLabel =
    strength.level <= 1
      ? t.auth.strengthWeak
      : strength.level === 2
        ? t.auth.strengthFair
        : strength.level === 3
          ? t.auth.strengthStrong
          : t.auth.strengthVeryStrong;

  const strengthBarColor =
    strength.level <= 1
      ? "bg-rose-500"
      : strength.level === 2
        ? "bg-amber-400"
        : strength.level === 3
          ? "bg-sky-400"
          : "bg-emerald-400";

  const strengthTextColor =
    strength.level <= 1
      ? "text-rose-300"
      : strength.level === 2
        ? "text-amber-300"
        : strength.level === 3
          ? "text-sky-300"
          : "text-emerald-300";

  const avatarEntries = Object.entries(AVATAR_STYLES) as Array<[AvatarStyleId, (typeof AVATAR_STYLES)[AvatarStyleId]]>;

  return (
    <section className="mx-auto w-full max-w-5xl py-2 md:py-6 animate-slide-up">
      <div className="grid gap-6 lg:grid-cols-12 lg:items-stretch">
        {/* Left column: Arena Showcase (appears below form on mobile so users can sign in immediately) */}
        <aside className="order-2 flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-ink-900/80 p-6 sm:p-8 lg:order-1 lg:col-span-6">
          <div className="space-y-6">
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.26em] text-purple-300">
                {t.auth.eyebrow}
              </p>
              <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-white sm:text-3xl">
                {isLogin ? t.auth.showcaseTitleLogin : t.auth.showcaseTitleRegister}
              </h2>
              <p className="mt-2.5 text-sm text-zinc-400">
                {t.auth.showcaseMeta(totalCharacters, animeCount)}
              </p>
            </div>

            {featuredCharacters.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {t.auth.featuredRosterLabel}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {featuredCharacters.map((c) => {
                    const rarity = RARITY_INFO[c.rarity];
                    return (
                      <div
                        key={c.id}
                        className="group relative overflow-hidden rounded-2xl border bg-ink-950 transition-transform duration-300 hover:-translate-y-1"
                        style={{ borderColor: `${rarity.color}66` }}
                      >
                        <div className="relative aspect-[3/4]">
                          <CharacterArt name={c.name} animeId={c.animeId} imageUrl={c.imageUrl} eager />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                          <div className="absolute inset-x-0 bottom-0 p-2.5">
                            <p className="truncate font-display text-xs font-bold text-white">{c.name}</p>
                            <p className="truncate text-[11px] text-zinc-300">{c.animeName}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3 border-t border-white/10 pt-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/15 text-purple-300">
                  <Gavel className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">{t.auth.feature1Title}</h3>
                  <p className="text-xs leading-relaxed text-zinc-400">{t.auth.feature1Desc}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-300">
                  <Swords className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">{t.auth.feature2Title}</h3>
                  <p className="text-xs leading-relaxed text-zinc-400">{t.auth.feature2Desc}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-300">
                  <Trophy className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">{t.auth.feature3Title}</h3>
                  <p className="text-xs leading-relaxed text-zinc-400">{t.auth.feature3Desc}</p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-zinc-400">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{t.auth.footerNote}</span>
          </p>
        </aside>

        {/* Right column: Interactive Auth Card */}
        <div className="order-1 glass-strong relative flex flex-col justify-between overflow-hidden rounded-3xl p-6 sm:p-8 neon-border lg:order-2 lg:col-span-6">
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-purple-600/25 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-rose-600/15 blur-3xl" aria-hidden />

          <div className="relative">
            {/* Segmented Mode Tabs */}
            <div
              role="tablist"
              aria-label={isLogin ? t.auth.tabLogin : t.auth.tabRegister}
              className="mb-6 grid grid-cols-2 rounded-2xl border border-white/10 bg-black/40 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={isLogin}
                onClick={() => switchMode("login")}
                className={cn(
                  "min-h-[44px] rounded-xl px-4 font-display text-sm font-semibold tracking-wide transition-all",
                  isLogin
                    ? "bg-gradient-to-r from-purple-600 to-rose-600 text-white shadow-lg shadow-purple-900/40"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                {t.auth.tabLogin}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isLogin}
                onClick={() => switchMode("register")}
                className={cn(
                  "min-h-[44px] rounded-xl px-4 font-display text-sm font-semibold tracking-wide transition-all",
                  !isLogin
                    ? "bg-gradient-to-r from-purple-600 to-rose-600 text-white shadow-lg shadow-purple-900/40"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                {t.auth.tabRegister}
              </button>
            </div>

            {/* Header with live avatar preview in Register mode */}
            <div className="mb-6 flex items-center gap-3.5">
              {isLogin ? (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-rose-600 shadow-lg shadow-purple-950/50">
                  <Gavel className="h-6 w-6 text-white" />
                </span>
              ) : (
                <Avatar
                  username={trimmedUsername || "AD"}
                  style={avatarStyle}
                  size={48}
                  ring="purple"
                />
              )}
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold text-white">
                  {isLogin ? t.auth.welcomeBack : t.auth.joinAuction}
                </h1>
                <p className="text-sm text-zinc-400">
                  {isLogin ? t.auth.loginSub : t.auth.registerSub}
                </p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-4" noValidate>
              {/* Username field */}
              <div>
                <label htmlFor="auth-username" className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-300">
                  {t.auth.usernameLabel}
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                  <input
                    id="auth-username"
                    name="username"
                    className={cn(
                      "input min-h-[46px] pl-10",
                      !isLogin ? "pr-10" : "",
                      !isLogin && (usernameStatus === "taken" || usernameStatus === "invalid")
                        ? "border-rose-500/60 focus:border-rose-400"
                        : !isLogin && usernameStatus === "available"
                          ? "border-emerald-500/50 focus:border-emerald-400"
                          : "",
                    )}
                    autoComplete="username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={t.auth.usernamePlaceholder}
                    maxLength={20}
                    required
                    autoFocus
                  />
                  {!isLogin && usernameStatus !== "idle" && (
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" aria-hidden>
                      {usernameStatus === "checking" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
                      ) : usernameStatus === "available" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-400" />
                      )}
                    </span>
                  )}
                </div>

                {!isLogin && (
                  <p
                    className={cn(
                      "mt-1.5 text-xs",
                      usernameStatus === "available"
                        ? "text-emerald-300"
                        : usernameStatus === "taken" || usernameStatus === "invalid"
                          ? "text-rose-300"
                          : "text-zinc-400",
                    )}
                  >
                    {usernameStatus === "checking"
                      ? t.auth.usernameChecking
                      : usernameStatus === "available"
                        ? t.auth.usernameAvailable
                        : usernameStatus === "taken" || usernameStatus === "invalid"
                          ? usernameReason ?? t.auth.usernameInvalid
                          : t.auth.usernameHint}
                  </p>
                )}
              </div>

              {/* Password field */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="auth-password" className="block text-xs font-semibold uppercase tracking-widest text-zinc-300">
                    {t.auth.passwordLabel}
                  </label>
                  {capsLockOn && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {t.auth.capsLockOn}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                  <input
                    id="auth-password"
                    name="password"
                    className="input min-h-[46px] pl-10 pr-12"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    onKeyDown={handleKeyModifiers}
                    onKeyUp={handleKeyModifiers}
                    placeholder={isLogin ? t.auth.passwordPlaceholderLogin : t.auth.passwordPlaceholderReg}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                    aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Live Password Strength Meter & Rules in Register Mode */}
                {!isLogin && password.length > 0 && (
                  <div className="mt-2.5 space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{t.auth.strengthLabel}</span>
                      <span className={cn("font-semibold", strengthTextColor)}>{strengthLabel}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5" aria-hidden>
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={cn(
                            "h-1.5 rounded-full transition-colors",
                            strength.level >= step ? strengthBarColor : "bg-white/10",
                          )}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-1 pt-0.5 sm:grid-cols-3">
                      <div className={cn("flex items-center gap-1.5 text-[11px]", strength.hasMinLength ? "text-emerald-300" : "text-zinc-400")}>
                        {strength.hasMinLength ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
                        <span>{t.auth.ruleMinLength}</span>
                      </div>
                      <div className={cn("flex items-center gap-1.5 text-[11px]", strength.hasUpperLower ? "text-emerald-300" : "text-zinc-400")}>
                        {strength.hasUpperLower ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
                        <span>{t.auth.ruleUpperLower}</span>
                      </div>
                      <div className={cn("flex items-center gap-1.5 text-[11px]", strength.hasNumberOrSymbol ? "text-emerald-300" : "text-zinc-400")}>
                        {strength.hasNumberOrSymbol ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
                        <span>{t.auth.ruleNumberOrSymbol}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password + Starter Emblem Picker in Register Mode */}
              {!isLogin && (
                <>
                  <div>
                    <label htmlFor="auth-confirm-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-300">
                      {t.auth.confirmPasswordLabel}
                    </label>
                    <div className="relative">
                      <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                      <input
                        id="auth-confirm-password"
                        name="confirmPassword"
                        className={cn(
                          "input min-h-[46px] pl-10 pr-12",
                          passwordsMismatch
                            ? "border-rose-500/60 focus:border-rose-400"
                            : passwordsMatch
                              ? "border-emerald-500/50 focus:border-emerald-400"
                              : "",
                        )}
                        type={showConfirm ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        onKeyDown={handleKeyModifiers}
                        onKeyUp={handleKeyModifiers}
                        placeholder={t.auth.confirmPasswordPlaceholder}
                        maxLength={128}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                        aria-label={showConfirm ? t.auth.hidePassword : t.auth.showPassword}
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPassword.length > 0 && (
                      <p className={cn("mt-1.5 flex items-center gap-1.5 text-xs", passwordsMatch ? "text-emerald-300" : "text-rose-300")}>
                        {passwordsMatch ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                        <span>{passwordsMatch ? t.auth.passwordsMatch : t.auth.passwordsMismatch}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-semibold uppercase tracking-widest text-zinc-300">{t.auth.avatarStyleLabel}</span>
                      <span className="text-zinc-400">{AVATAR_STYLES[avatarStyle].label}</span>
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      {avatarEntries.map(([id, meta]) => {
                        const selected = avatarStyle === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setAvatarStyle(id)}
                            aria-label={`${t.auth.avatarStyleLabel}: ${meta.label}`}
                            aria-pressed={selected}
                            className={cn(
                              "relative flex h-11 items-center justify-center rounded-xl border transition-all",
                              selected
                                ? "scale-[1.03] border-white ring-2 ring-purple-400/70"
                                : "border-white/15 opacity-80 hover:opacity-100",
                            )}
                            style={{ background: avatarGradient(id) }}
                          >
                            {selected && <Check className="h-4 w-4 text-white drop-shadow" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <FormError message={error} />

              <button
                type="submit"
                className="btn btn-primary min-h-[48px] w-full text-sm sm:text-base"
                disabled={loading}
              >
                {loading ? <Spinner className="h-4 w-4 text-white" /> : null}
                <span>{isLogin ? t.auth.loginBtn : t.auth.registerBtn}</span>
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-zinc-400">
              {isLogin ? t.auth.newHere : t.auth.alreadyAccount}
              <button
                type="button"
                onClick={() => switchMode(isLogin ? "register" : "login")}
                className="font-semibold text-purple-300 underline-offset-4 transition-colors hover:text-purple-200 hover:underline"
              >
                {isLogin ? t.auth.createAccountLink : t.auth.loginLink}
              </button>
            </p>
          </div>

          <p className="relative mt-6 border-t border-white/10 pt-4 text-center text-xs text-zinc-400">
            {t.auth.securityNote}
          </p>
        </div>
      </div>
    </section>
  );
}
