import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import { PageHeader } from "@/components/ui/primitives";
import { PlayHub } from "@/components/play/PlayHub";

export const metadata: Metadata = { title: "Play" };

export default async function PlayPage() {
  await requireUser("/play");
  return (
    <>
      <PageHeader
        eyebrow="Play"
        title={<>Find your <span className="text-gradient">rival</span></>}
        description="Jump into a quick match, host your own room, or join a friend with a code. Every player starts with $20."
      />
      <PlayHub />
    </>
  );
}
