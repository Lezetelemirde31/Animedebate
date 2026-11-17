import type { NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/http";
import { createRoomSchema } from "@/lib/validation";
import { EngineError, createRoom, listOpenRooms } from "@/server/live/service";
import { handleLive, ok } from "@/server/live/http";

export const dynamic = "force-dynamic";

const KEYS: Record<string, string> = {
  totalLots: "LOTS_INVALID",
  bidSeconds: "TIMER_INVALID",
  animeIds: "ANIME_REQUIRED",
};

/** Public rooms waiting for a challenger. */
export async function GET(req: NextRequest) {
  return handleLive(req, async () => ok(await listOpenRooms()));
}

/** Create a room and take its first seat. */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    if (!rateLimit(`room-create:${user.id}:${clientIp(req)}`, 20, 10 * 60_000)) throw new EngineError("RATE_LIMITED");
    const parsed = createRoomSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue?.path[0] ?? "");
      const key = field === "animeIds" && issue?.code === "custom" ? "ANIME_UNSUPPORTED" : KEYS[field] ?? "INVALID_INPUT";
      throw new EngineError("INVALID_INPUT", key);
    }
    return ok({ code: await createRoom(user.id, parsed.data) });
  });
}
