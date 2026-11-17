import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import { loadPlayerArenaPool } from "@/lib/arena-server";
import { getServerTranslations } from "@/lib/i18n-server";
import { PageHeader, Spinner } from "@/components/ui/primitives";
import { ArenaHubClient } from "@/components/arena/ArenaHubClient";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t.arena.metaTitle };
}

export default async function ArenaPage() {
  const [user, { t }] = await Promise.all([requireUser("/arena"), getServerTranslations()]);
  const pool = await loadPlayerArenaPool(user.id);

  return (
    <>
      <PageHeader
        eyebrow={t.arena.eyebrow}
        title={
          <>
            {t.arena.headingStart} <span className="text-gradient">{t.arena.headingAccent}</span>
          </>
        }
        description={t.arena.description}
      />
      <Suspense
        fallback={
          <div className="glass rounded-3xl p-12 text-center">
            <Spinner className="mx-auto h-8 w-8 text-purple-400" />
          </div>
        }
      >
        <ArenaHubClient
          user={{
            id: user.id,
            username: user.username,
            avatar: { style: user.avatarStyle, imageUrl: user.avatarImage },
          }}
          playableCards={pool.playableCards}
          allCatalogCards={pool.allCatalogCards}
          ownedIds={pool.ownedIds}
        />
      </Suspense>
    </>
  );
}
