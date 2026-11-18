import type { NextRequest } from "next/server";
import { handleLive, ok } from "@/server/live/http";
import { queueLeave } from "@/server/versus/service";

export const dynamic = "force-dynamic";

/** Leaves the ranked queue (sent with `navigator.sendBeacon` when the page closes). */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    if (ctx.user) await queueLeave(ctx.user.id);
    return ok();
  });
}
