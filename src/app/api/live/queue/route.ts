import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { EngineError, joinQueue, leaveQueue } from "@/server/live/service";
import { handleLive, ok } from "@/server/live/http";

export const dynamic = "force-dynamic";

/** Join matchmaking. Answers with a room code if an opponent was found at once. */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    if (!rateLimit(`queue:${user.id}`, 30, 60_000)) throw new EngineError("RATE_LIMITED");
    return ok({ matchedCode: await joinQueue(user.id) });
  });
}

export async function DELETE(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    await leaveQueue(ctx.requireUser().id);
    return ok();
  });
}
