import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/primitives";
import { NotificationsList } from "@/components/community/NotificationsList";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.notificationsPage.title };
}

export default async function NotificationsPage() {
  const [user, { t }] = await Promise.all([requireUser("/notifications"), getServerTranslations()]);
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const items = rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    message: r.message,
    linkUrl: r.linkUrl,
    isRead: r.isRead,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        eyebrow={t.notificationsPage.eyebrow}
        title={
          <>
            {t.notificationsPage.headingStart} <span className="text-gradient">{t.notificationsPage.headingAccent}</span>
          </>
        }
        description={t.notificationsPage.description}
      />
      <NotificationsList initial={items} />
    </>
  );
}
