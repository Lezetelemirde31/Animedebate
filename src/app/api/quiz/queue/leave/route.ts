import type { NextRequest } from "next/server";
import { handleLive, ok } from "@/server/live/http";
import { quizQueueLeave } from "@/server/quiz/race";

export const dynamic = "force-dynamic";

/** Leaves the ranked quiz queue (sent with `navigator.sendBeacon` when the page closes). */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    if (ctx.user) await quizQueueLeave(ctx.user.id);
    return ok();
  });
}
