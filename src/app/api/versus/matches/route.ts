import type { NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/http";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { createBotMatch, createFriendlyMatch } from "@/server/versus/service";

export const dynamic = "force-dynamic";

/** Start a practice match against a bot, or open a friendly room. */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    if (!rateLimit(`versus-create:${user.id}:${clientIp(req)}`, 30, 10 * 60_000)) throw new EngineError("RATE_LIMITED");
    const body = (await req.json().catch(() => null)) as { mode?: unknown; level?: unknown } | null;
    if (body?.mode === "bot") {
      const level = body.level === "EASY" || body.level === "HARD" ? body.level : "NORMAL";
      return ok({ code: await createBotMatch(user.id, level) });
    }
    if (body?.mode === "friendly") return ok({ code: await createFriendlyMatch(user.id) });
    throw new EngineError("INVALID_INPUT");
  });
}
