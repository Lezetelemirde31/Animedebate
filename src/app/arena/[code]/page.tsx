import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { normalizeRoomCode } from "@/game/rules";
import { getServerTranslations } from "@/lib/i18n-server";
import { ArenaRoomClient } from "@/components/arena/ArenaRoomClient";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const [{ code }, { locale }] = await Promise.all([params, getServerTranslations()]);
  const prefix = locale === "tr" ? "Arena Odası" : "Arena Room";
  return { title: `${prefix} ${code.toUpperCase()}` };
}

export default async function ArenaRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeRoomCode(raw);
  if (!code) notFound();
  await requireUser(`/arena/${code}`);
  return <ArenaRoomClient code={code} />;
}
