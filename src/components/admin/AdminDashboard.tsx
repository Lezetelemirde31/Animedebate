"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Lock, Pin, Search, Shield, Trash2, Unlock } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { cn, timeAgo } from "@/lib/utils";

interface AdminUserRow {
  id: string;
  username: string;
  role: string;
  xp: number;
  level: number;
  isBanned: boolean;
  bannedReason: string | null;
  debatesCount: number;
  commentsCount: number;
  createdAt: string;
}

interface AdminDebateRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  isPinned: boolean;
  authorUsername: string;
  commentsCount: number;
  createdAt: string;
}

interface AdminComparisonRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  authorUsername: string;
  votesTotal: number;
  createdAt: string;
}

interface AdminCommentRow {
  id: string;
  body: string;
  authorUsername: string;
  createdAt: string;
}

interface AuditLogRow {
  id: string;
  adminUsername: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
}

export function AdminDashboard({
  currentAdminId,
  currentAdminRole,
  users: initialUsers,
  debates: initialDebates,
  comparisons: initialComparisons,
  comments: initialComments,
  logs,
}: {
  currentAdminId: string;
  currentAdminRole: string;
  users: AdminUserRow[];
  debates: AdminDebateRow[];
  comparisons: AdminComparisonRow[];
  comments: AdminCommentRow[];
  logs: AuditLogRow[];
}) {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const [tab, setTab] = useState<"users" | "debates" | "comparisons" | "comments" | "logs">("users");
  const [users, setUsers] = useState(initialUsers);
  const [debates, setDebates] = useState(initialDebates);
  const [comparisons, setComparisons] = useState(initialComparisons);
  const [comments, setComments] = useState(initialComments);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  async function updateUser(id: string, body: Record<string, unknown>) {
    setFeedback(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; user?: Partial<AdminUserRow> } | null;
    if (!res.ok || !data?.ok) {
      setFeedback(data?.error ?? t.admin.actionFailed);
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data.user } : u)));
    setFeedback(t.admin.userUpdated);
    router.refresh();
  }

  async function moderateContent(
    targetType: "DEBATE" | "COMPARISON" | "COMMENT",
    targetId: string,
    action: "PIN" | "UNPIN" | "LOCK" | "OPEN" | "HIDE" | "DELETE",
  ) {
    setFeedback(null);
    const res = await fetch("/api/admin/content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, action }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !data?.ok) {
      setFeedback(data?.error ?? t.admin.modFailed);
      return;
    }
    if (targetType === "DEBATE") {
      if (action === "DELETE") setDebates((p) => p.filter((d) => d.id !== targetId));
      else {
        setDebates((p) =>
          p.map((d) =>
            d.id === targetId
              ? {
                  ...d,
                  isPinned: action === "PIN" ? true : action === "UNPIN" ? false : d.isPinned,
                  status: action === "LOCK" ? "LOCKED" : action === "HIDE" ? "HIDDEN" : action === "OPEN" ? "OPEN" : d.status,
                }
              : d,
          ),
        );
      }
    } else if (targetType === "COMPARISON") {
      if (action === "DELETE") setComparisons((p) => p.filter((c) => c.id !== targetId));
      else {
        setComparisons((p) =>
          p.map((c) =>
            c.id === targetId
              ? { ...c, status: action === "LOCK" ? "LOCKED" : action === "HIDE" ? "HIDDEN" : "OPEN" }
              : c,
          ),
        );
      }
    } else if (targetType === "COMMENT" && action === "DELETE") {
      setComments((p) => p.filter((c) => c.id !== targetId));
    }
    setFeedback(t.admin.actionApplied);
    router.refresh();
  }

  const filteredUsers = query.trim()
    ? users.filter((u) => u.username.toLowerCase().includes(query.trim().toLowerCase()))
    : users;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "users", label: t.admin.tabs.users(users.length) },
            { id: "debates", label: t.admin.tabs.debates(debates.length) },
            { id: "comparisons", label: t.admin.tabs.comparisons(comparisons.length) },
            { id: "comments", label: t.admin.tabs.comments(comments.length) },
            { id: "logs", label: t.admin.tabs.logs(logs.length) },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className="chip"
              data-active={tab === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
        {feedback && <span className="text-xs font-medium text-emerald-300">{feedback}</span>}
      </div>

      {tab === "users" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              className="input pl-10"
              placeholder={t.admin.filterUsersPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="glass overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-widest text-zinc-500">
                    <th className="px-4 py-3">{t.admin.colUser}</th>
                    <th className="px-4 py-3">{t.admin.colRole}</th>
                    <th className="px-4 py-3">{t.admin.colLevelXp}</th>
                    <th className="px-4 py-3">{t.admin.colActivity}</th>
                    <th className="px-4 py-3">{t.admin.colStatus}</th>
                    <th className="px-4 py-3 text-right">{t.admin.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <Link href={`/profile/${u.username}`} className="font-display font-semibold text-white hover:underline">
                          {u.username}
                        </Link>
                        <div className="text-xs text-zinc-500">
                          {t.admin.joined} {timeAgo(new Date(u.createdAt), locale)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {currentAdminRole === "ADMIN" && u.id !== currentAdminId ? (
                          <select
                            className="rounded-lg border border-white/10 bg-ink-900 px-2 py-1 text-xs text-zinc-200"
                            value={u.role}
                            onChange={(e) => updateUser(u.id, { role: e.target.value })}
                          >
                            <option value="USER">USER</option>
                            <option value="MODERATOR">MODERATOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-xs text-purple-200">
                            <Shield className="h-3 w-3" /> {u.role}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {t.nav.levelShort}.{u.level} <span className="text-xs text-zinc-500">({u.xp} XP)</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {u.debatesCount} {t.admin.debatesShort} · {u.commentsCount} {t.admin.commentsShort}
                      </td>
                      <td className="px-4 py-3">
                        {u.isBanned ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
                            <Ban className="h-3 w-3" /> {t.admin.banned}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> {t.admin.active}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.id !== currentAdminId && (
                          <button
                            type="button"
                            onClick={() => updateUser(u.id, { isBanned: !u.isBanned })}
                            className={cn("btn !px-3 !py-1.5 !text-xs", u.isBanned ? "btn-ghost" : "btn-danger")}
                          >
                            {u.isBanned ? t.admin.unban : t.admin.ban}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "debates" && (
        <div className="space-y-2.5">
          {debates.map((d) => (
            <div key={d.id} className="glass flex flex-col justify-between gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
              <div>
                <Link href={`/debates/${d.slug}`} className="font-display font-semibold text-white hover:underline">
                  {d.title}
                </Link>
                <div className="mt-1 text-xs text-zinc-400">
                  {t.comparisons.byAuthor} {d.authorUsername} · {t.admin.statusWord} <b>{d.status}</b> {d.isPinned ? `· ${t.admin.pinnedBadge}` : ""} · {d.commentsCount} {t.admin.commentsShort}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => moderateContent("DEBATE", d.id, d.isPinned ? "UNPIN" : "PIN")} className="btn btn-ghost !px-3 !py-1.5 !text-xs">
                  <Pin className="h-3.5 w-3.5" /> {d.isPinned ? t.admin.unpin : t.admin.pin}
                </button>
                <button type="button" onClick={() => moderateContent("DEBATE", d.id, d.status === "LOCKED" ? "OPEN" : "LOCK")} className="btn btn-ghost !px-3 !py-1.5 !text-xs">
                  {d.status === "LOCKED" ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {d.status === "LOCKED" ? t.admin.open : t.admin.lock}
                </button>
                <button type="button" onClick={() => moderateContent("DEBATE", d.id, "DELETE")} className="btn btn-danger !px-3 !py-1.5 !text-xs">
                  <Trash2 className="h-3.5 w-3.5" /> {t.admin.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "comparisons" && (
        <div className="space-y-2.5">
          {comparisons.map((c) => (
            <div key={c.id} className="glass flex flex-col justify-between gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
              <div>
                <Link href={`/comparisons/${c.slug}`} className="font-display font-semibold text-white hover:underline">
                  {c.title}
                </Link>
                <div className="mt-1 text-xs text-zinc-400">
                  {t.comparisons.byAuthor} {c.authorUsername} · {t.admin.statusWord} <b>{c.status}</b> · {c.votesTotal} {t.admin.votesShort}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => moderateContent("COMPARISON", c.id, c.status === "LOCKED" ? "OPEN" : "LOCK")} className="btn btn-ghost !px-3 !py-1.5 !text-xs">
                  {c.status === "LOCKED" ? t.admin.open : t.admin.lock}
                </button>
                <button type="button" onClick={() => moderateContent("COMPARISON", c.id, "DELETE")} className="btn btn-danger !px-3 !py-1.5 !text-xs">
                  <Trash2 className="h-3.5 w-3.5" /> {t.admin.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "comments" && (
        <div className="space-y-2.5">
          {comments.map((c) => (
            <div key={c.id} className="glass flex flex-col justify-between gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-zinc-400">
                  <b className="text-white">{c.authorUsername}</b> · {timeAgo(new Date(c.createdAt), locale)}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-200">{c.body}</p>
              </div>
              <button type="button" onClick={() => moderateContent("COMMENT", c.id, "DELETE")} className="btn btn-danger shrink-0 !px-3 !py-1.5 !text-xs">
                <Trash2 className="h-3.5 w-3.5" /> {t.admin.remove}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "logs" && (
        <div className="glass divide-y divide-white/5 overflow-hidden rounded-2xl">
          {logs.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">{t.admin.noLogs}</p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                <div>
                  <span className="font-semibold text-purple-200">{l.adminUsername}</span>{" "}
                  <span className="text-zinc-300">{l.action}</span>{" "}
                  <span className="text-zinc-500">
                    ({l.targetType} {l.targetId})
                  </span>
                  {l.reason && <span className="ml-2 text-zinc-400">— {l.reason}</span>}
                </div>
                <span className="text-zinc-500">{timeAgo(new Date(l.createdAt), locale)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
