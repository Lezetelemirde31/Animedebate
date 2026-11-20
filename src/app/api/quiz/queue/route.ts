import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { quizQueueLeave, quizQueuePoll } from "@/server/quiz/race";

export const dynamic = "force-dynamic";

/** Join the ranked quiz queue (`{ join: true }`) or check on it; returns the room code once paired. */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    if (!rateLimit(`quiz-queue:${user.id}`, 40, 10_000)) throw new EngineError("RATE_LIMITED");
    const body = (await req.json().catch(() => null)) as { join?: boolean } | null;
    return ok(await quizQueuePoll(user.id, body?.join === true));
  });
}

export async function DELETE(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    await quizQueueLeave(ctx.requireUser().id);
    return ok();
  });
}
