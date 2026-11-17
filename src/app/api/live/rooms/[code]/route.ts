import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { normalizeRoomCode } from "@/game/rules";
import type { RoomAction } from "@/game/types";
import { EngineError, roomRequest } from "@/server/live/service";
import { handleLive, ok } from "@/server/live/http";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["join", "sync", "ready", "bid", "leave", "rematch"]);

/**
 * Every room interaction: the body is `{ action, ... }`. The answer is the
 * room's authoritative snapshot after the action and after any timers that
 * became due were applied.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const receivedAt = Date.now();
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    const code = normalizeRoomCode((await params).code);
    if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
    const body = (await req.json().catch(() => null)) as RoomAction | null;
    if (!body || typeof body !== "object" || !ACTIONS.has(body.action)) throw new EngineError("INVALID_INPUT");
    if (!rateLimit(`room:${user.id}`, 80, 10_000)) throw new EngineError("RATE_LIMITED");
    return ok(await roomRequest(code, user.id, body, receivedAt));
  });
}
