import type { NextRequest } from "next/server";
import { presence } from "@/server/live/service";
import { handleLive, ok } from "@/server/live/http";

export const dynamic = "force-dynamic";

/** Heartbeat + site stats + the caller's matchmaking status and live match. */
export async function GET(req: NextRequest) {
  return handleLive(req, async (ctx) => ok(await presence(ctx.user?.id ?? null)));
}
