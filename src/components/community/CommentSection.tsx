"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight, MessageSquare, Pencil, Send, Shield, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import { Avatar } from "@/components/ui/Avatar";
import { FormError, Spinner } from "@/components/ui/primitives";
import { ReactionBar } from "./ReactionBar";
import { timeAgo } from "@/lib/utils";

export interface CommentItemDTO {
  id: string;
  authorId: string;
  parentId: string | null;
  body: string;
  likesCount: number;
  dislikesCount: number;
  editedAt: string | null;
  createdAt: string;
  userReaction: number | null;
  author: {
    id: string;
    username: string;
    role: string;
    level: number;
    avatarStyle: string;
    avatarImage: string | null;
  };
}

export function CommentSection({
  targetType,
  targetId,
  initialComments,
  locked = false,
}: {
  targetType: "DEBATE" | "COMPARISON" | "CHARACTER";
  targetId: string;
  initialComments: CommentItemDTO[];
  locked?: boolean;
}) {
  const user = useCurrentUser();
  const { locale, t } = useLanguage();
  const router = useRouter();
  const [comments, setComments] = useState<CommentItemDTO[]>(initialComments);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStaff = user?.role === "ADMIN" || user?.role === "MODERATOR";

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      router.push("/login");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          parentId: replyTo?.id ?? null,
          body,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; comment?: any } | null;
      if (!res.ok || !data?.ok || !data.comment) {
        setError(data?.error ?? t.community.commentPostError);
        return;
      }
      const c = data.comment;
      const item: CommentItemDTO = {
        id: c.id,
        authorId: c.authorId,
        parentId: c.parentId ?? null,
        body: c.body,
        likesCount: c.likesCount ?? 0,
        dislikesCount: c.dislikesCount ?? 0,
        editedAt: null,
        createdAt: c.createdAt ?? new Date().toISOString(),
        userReaction: null,
        author: {
          id: c.author.id,
          username: c.author.username,
          role: c.author.role,
          level: c.author.level,
          avatarStyle: c.author.avatarStyle,
          avatarImage: c.author.avatarCustomUrl ?? c.author.avatarCharacter?.imageUrl ?? null,
        },
      };
      setComments((prev) => [...prev, item]);
      setBody("");
      setReplyTo(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function saveEdit(id: string) {
    setError(null);
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editBody }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? t.community.commentUpdateError);
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, body: editBody, editedAt: new Date().toISOString() } : c)),
    );
    setEditingId(null);
    setEditBody("");
  }

  async function deleteComment(id: string) {
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
      router.refresh();
    }
  }

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<string, CommentItemDTO[]>();
  for (const c of comments) {
    if (c.parentId) {
      const list = repliesByParent.get(c.parentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentId, list);
    }
  }

  function renderComment(c: CommentItemDTO, isReply = false) {
    const canModify = user && (user.id === c.authorId || isStaff);
    return (
      <div
        key={c.id}
        className={isReply ? "ml-6 mt-3 border-l border-purple-500/25 pl-4 md:ml-10" : "glass rounded-2xl p-4 md:p-5"}
      >
        <div className="flex items-start gap-3">
          <Avatar username={c.author.username} style={c.author.avatarStyle} imageUrl={c.author.avatarImage} size={isReply ? 30 : 36} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link href={`/profile/${c.author.username}`} className="font-display text-sm font-semibold text-white hover:underline">
                {c.author.username}
              </Link>
              <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
                {t.nav.levelShort}.{c.author.level}
              </span>
              {(c.author.role === "ADMIN" || c.author.role === "MODERATOR") && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
                  <Shield className="h-2.5 w-2.5" /> {c.author.role}
                </span>
              )}
              <span className="text-zinc-500">{timeAgo(new Date(c.createdAt), locale)}</span>
              {c.editedAt && <span className="text-zinc-600">{t.community.edited}</span>}
            </div>

            {editingId === c.id ? (
              <div className="mt-2 space-y-2">
                <textarea
                  className="input min-h-[80px] text-sm"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  maxLength={2000}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => saveEdit(c.id)} className="btn btn-primary !px-3 !py-1.5 !text-xs">
                    {t.community.save}
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="btn btn-ghost !px-3 !py-1.5 !text-xs">
                    {t.community.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{c.body}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ReactionBar
                targetType="COMMENT"
                targetId={c.id}
                initialLikes={c.likesCount}
                initialDislikes={c.dislikesCount}
                initialValue={c.userReaction}
                signedIn={Boolean(user)}
                size="sm"
              />
              {!isReply && !locked && (
                <button
                  type="button"
                  onClick={() => setReplyTo({ id: c.id, username: c.author.username })}
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-purple-200"
                >
                  <CornerDownRight className="h-3.5 w-3.5" /> {t.community.reply}
                </button>
              )}
              {canModify && editingId !== c.id && (
                <>
                  {user.id === c.authorId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditBody(c.body);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
                    >
                      <Pencil className="h-3 w-3" /> {t.community.edit}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteComment(c.id)}
                    className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" /> {t.community.delete}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        {!isReply && repliesByParent.get(c.id)?.map((reply) => renderComment(reply, true))}
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-white">
          <MessageSquare className="h-5 w-5 text-purple-300" />
          {t.community.discussion} <span className="text-sm font-normal text-zinc-400">({comments.length})</span>
        </h2>
      </div>

      {locked ? (
        <div className="glass rounded-2xl p-4 text-sm text-amber-200">{t.community.lockedThread}</div>
      ) : user ? (
        <form onSubmit={postComment} className="glass-strong rounded-2xl p-4 md:p-5">
          {replyTo && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-xs text-purple-200">
              <span>{t.community.replyingTo(replyTo.username)}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-zinc-300 hover:text-white">
                {t.community.cancel}
              </button>
            </div>
          )}
          <textarea
            className="input min-h-[96px] text-sm"
            placeholder={t.community.commentPlaceholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            required
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">{body.length} / 2000</span>
            <button type="submit" className="btn btn-primary !py-2" disabled={pending || body.trim().length < 2}>
              {pending ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}
              {t.community.postComment}
            </button>
          </div>
          <div className="mt-3">
            <FormError message={error} />
          </div>
        </form>
      ) : (
        <div className="glass flex flex-col items-center justify-between gap-3 rounded-2xl p-5 sm:flex-row">
          <p className="text-sm text-zinc-300">{t.community.signInPrompt}</p>
          <Link href="/login" className="btn btn-primary !py-2">
            {t.community.loginToComment}
          </Link>
        </div>
      )}

      {topLevel.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-zinc-500">{t.community.noCommentsYet}</div>
      ) : (
        <div className="space-y-3">{topLevel.map((c) => renderComment(c))}</div>
      )}
    </section>
  );
}
