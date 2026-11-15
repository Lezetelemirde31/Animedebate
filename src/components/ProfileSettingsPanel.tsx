"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Save, Settings } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { FormError, Spinner } from "@/components/ui/primitives";

export function ProfileSettingsPanel({
  currentUsername,
  currentBio,
}: {
  currentUsername: string;
  currentBio: string | null;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(currentUsername);
  const [bio, setBio] = useState(currentBio ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileErr(null);
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, bio }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        user?: { username: string };
      } | null;
      if (!res.ok || !data?.ok) {
        setProfileErr(data?.error ?? t.profile.profileSaveError);
        return;
      }
      setProfileMsg(t.profile.profileSaved);
      if (data.user?.username && data.user.username !== currentUsername) {
        router.push(`/profile/${encodeURIComponent(data.user.username)}`);
      } else {
        router.refresh();
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(null);
    setPwMsg(null);
    setSavingPw(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setPwErr(data?.error ?? t.profile.passwordUpdateError);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPwMsg(t.profile.passwordUpdated);
    } finally {
      setSavingPw(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost !py-2">
        <Settings className="h-4 w-4" /> {t.profile.editSettingsBtn}
      </button>
    );
  }

  return (
    <div className="glass-strong rounded-3xl p-6 neon-border animate-slide-up">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-white">{t.profile.settingsTitle}</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-white">
          {t.profile.close}
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <form onSubmit={saveProfile} className="space-y-4">
          <h3 className="font-display text-xs font-semibold uppercase tracking-widest text-purple-300">
            {t.profile.usernameBioTitle}
          </h3>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">{t.profile.usernameCooldownHint}</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">{t.profile.bioLabel}</span>
            <textarea
              className="input min-h-[84px] text-sm"
              placeholder={t.profile.bioPlaceholder}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
            />
          </label>
          <FormError message={profileErr} />
          {profileMsg && <p className="text-xs text-emerald-300">{profileMsg}</p>}
          <button type="submit" disabled={savingProfile} className="btn btn-primary !py-2">
            {savingProfile ? <Spinner className="h-4 w-4 text-white" /> : <Save className="h-4 w-4" />}
            {t.profile.saveProfile}
          </button>
        </form>

        <form onSubmit={changePassword} className="space-y-4">
          <h3 className="font-display text-xs font-semibold uppercase tracking-widest text-rose-300">
            {t.profile.changePasswordTitle}
          </h3>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">{t.profile.currentPassword}</span>
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">{t.profile.newPassword}</span>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <FormError message={pwErr} />
          {pwMsg && <p className="text-xs text-emerald-300">{pwMsg}</p>}
          <button type="submit" disabled={savingPw} className="btn btn-ghost !py-2">
            {savingPw ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
            {t.profile.updatePassword}
          </button>
        </form>
      </div>
    </div>
  );
}
