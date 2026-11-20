import type { NextRequest } from "next/server";
import { handleLive, ok } from "@/server/live/http";
import { guessQueueLeave } from "@/server/guess/race";

export const dynamic = "force-dynamic";

/** Leaves the ranked race queue (sent with `navigator.sendBeacon` when the page closes). */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    if (ctx.user) await guessQueueLeave(ctx.user.id);
    return ok();
  });
}
