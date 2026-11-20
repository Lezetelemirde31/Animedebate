import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { queueLeave, queuePoll } from "@/server/versus/service";

export const dynamic = "force-dynamic";

/** Join the ranked queue (`{ join: true }`) or check on it; returns the match code once paired. */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    if (!rateLimit(`versus-queue:${user.id}`, 40, 10_000)) throw new EngineError("RATE_LIMITED");
    const body = (await req.json().catch(() => null)) as { join?: boolean } | null;
    return ok(await queuePoll(user.id, body?.join === true));
  });
}

export async function DELETE(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    await queueLeave(ctx.requireUser().id);
    return ok();
  });
}
