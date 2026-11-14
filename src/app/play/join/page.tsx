import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { requireUser } from "@/lib/auth/server";
import { PageHeader } from "@/components/ui/primitives";
import { JoinCodeForm } from "@/components/play/JoinCodeForm";

export const metadata: Metadata = { title: "Join room" };

export default async function JoinRoomPage() {
  await requireUser("/play/join");
  return (
    <>
      <PageHeader eyebrow="Join room" title={<>Enter a <span className="text-gradient">room code</span></>} />
      <div className="mx-auto max-w-xl">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-8 neon-border animate-slide-up">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-purple-600/30 blur-3xl" />
          <div className="relative">
            <KeyRound className="h-10 w-10 text-purple-300" />
            <p className="mt-3 text-zinc-300">
              Room codes are 6 characters long. If the room still has a free seat you&apos;ll take it — otherwise you can watch as a spectator.
            </p>
            <div className="mt-6">
              <JoinCodeForm />
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500">
          No code? <Link href="/play" className="text-purple-300 hover:text-purple-200">Find a match automatically</Link>.
        </p>
      </div>
    </>
  );
}
