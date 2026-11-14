import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { enabledCharacterWhere } from "@/lib/characters";
import { PageHeader } from "@/components/ui/primitives";
import { CreateRoomForm } from "@/components/play/CreateRoomForm";

export const metadata: Metadata = { title: "Create room" };

export default async function CreateRoomPage() {
  await requireUser("/play/create");
  const counts = await prisma.character.groupBy({ by: ["animeId"], where: enabledCharacterWhere, _count: { _all: true } });
  const characterCounts = Object.fromEntries(counts.map((c) => [c.animeId, c._count._all]));
  return (
    <>
      <PageHeader
        eyebrow="Create room"
        title={<>Host an <span className="text-gradient">auction</span></>}
        description="Configure your room, then share the code. The auction begins when both players are ready."
      />
      <CreateRoomForm characterCounts={characterCounts} />
    </>
  );
}
