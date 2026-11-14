"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Gavel } from "lucide-react";
import { FormError, Spinner } from "@/components/ui/primitives";

function safeNext(next: string | undefined): string {
  // Only allow same-site relative redirects.
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/play";
  return next;
}

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === "login";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      // Full navigation so the live connection re-authenticates with the new session.
      window.location.href = safeNext(next);
    } catch {
      setError("Could not reach the server. Check your connection.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-md animate-slide-up">
      <div className="glass-strong relative overflow-hidden rounded-3xl p-8 neon-border">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-purple-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-rose-600/20 blur-3xl" />
        <div className="relative">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-rose-600">
              <Gavel className="h-6 w-6 text-white" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-white">{isLogin ? "Welcome back" : "Join the auction"}</h1>
              <p className="text-sm text-zinc-400">
                {isLogin ? "Sign in to bid, collect and climb the leaderboard." : "Create your bidder account — it takes seconds."}
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">Username</span>
              <input
                className="input"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. HiddenLeafBidder"
                maxLength={20}
                required
                autoFocus
              />
              {!isLogin && <span className="mt-1 block text-xs text-zinc-500">3–20 characters: letters, numbers, underscores.</span>}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">Password</span>
              <div className="relative">
                <input
                  className="input pr-11"
                  type={show ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isLogin ? "Your password" : "At least 8 characters"}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <FormError message={error} />
            <button type="submit" className="btn btn-primary w-full" disabled={loading || !username || !password}>
              {loading ? <Spinner className="h-4 w-4 text-white" /> : null}
              {isLogin ? "Log in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-400">
            {isLogin ? "New here? " : "Already have an account? "}
            <Link
              href={isLogin ? `/register${next ? `?next=${encodeURIComponent(next)}` : ""}` : `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="font-semibold text-purple-300 hover:text-purple-200"
            >
              {isLogin ? "Create an account" : "Log in"}
            </Link>
          </p>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-zinc-500">Every match starts you with $20 of virtual money. No real money is ever involved.</p>
    </div>
  );
}
