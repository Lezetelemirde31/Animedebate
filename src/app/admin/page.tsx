import type { Metadata } from "next";
import { Flame, MessageSquare, Shield, Swords, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { PageHeader, StatTile } from "@/components/ui/primitives";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.admin.metaTitle };
}

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [admin, { t }] = await Promise.all([requireAdmin("/admin"), getServerTranslations()]);

  const [users, debates, comparisons, comments, logs, totalUsers, totalDebates, totalComparisons, totalComments] =
    await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.debate.findMany({
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { author: { select: { username: true } } },
      }),
      prisma.characterComparison.findMany({
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { author: { select: { username: true } } },
      }),
      prisma.comment.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { author: { select: { username: true } } },
      }),
      prisma.moderationLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { admin: { select: { username: true } } },
      }),
      prisma.user.count(),
      prisma.debate.count(),
      prisma.characterComparison.count(),
      prisma.comment.count({ where: { isDeleted: false } }),
    ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.admin.eyebrow}
        title={
          <>
            {t.admin.headingStart} <span className="text-gradient">{t.admin.headingAccent}</span>
          </>
        }
        description={t.admin.description}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t.admin.totalUsers} value={totalUsers} icon={Users} accent="purple" />
        <StatTile label={t.admin.debates} value={totalDebates} icon={Flame} accent="red" />
        <StatTile label={t.admin.vsMatchups} value={totalComparisons} icon={Swords} accent="sky" />
        <StatTile label={t.admin.activeComments} value={totalComments} icon={MessageSquare} accent="green" />
      </div>

      <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3 text-xs text-amber-200">
        <Shield className="h-4 w-4 shrink-0" />
        <span>
          {t.admin.signedInAs} <b className="text-white">{admin.username}</b> ({admin.role}). {t.admin.auditNotice}
        </span>
      </div>

      <AdminDashboard
        currentAdminId={admin.id}
        currentAdminRole={admin.role}
        users={users.map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role,
          xp: u.xp,
          level: u.level,
          isBanned: u.isBanned,
          bannedReason: u.bannedReason,
          debatesCount: u.debatesCount,
          commentsCount: u.commentsCount,
          createdAt: u.createdAt.toISOString(),
        }))}
        debates={debates.map((d) => ({
          id: d.id,
          slug: d.slug,
          title: d.title,
          status: d.status,
          isPinned: d.isPinned,
          authorUsername: d.author.username,
          commentsCount: d.commentsCount,
          createdAt: d.createdAt.toISOString(),
        }))}
        comparisons={comparisons.map((c) => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          status: c.status,
          authorUsername: c.author.username,
          votesTotal: c.votesACount + c.votesBCount,
          createdAt: c.createdAt.toISOString(),
        }))}
        comments={comments.map((c) => ({
          id: c.id,
          body: c.body,
          authorUsername: c.author.username,
          createdAt: c.createdAt.toISOString(),
        }))}
        logs={logs.map((l) => ({
          id: l.id,
          adminUsername: l.admin.username,
          action: l.action,
          targetType: l.targetType,
          targetId: l.targetId,
          reason: l.reason,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
