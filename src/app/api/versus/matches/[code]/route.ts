import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { matchRequest, ratingChangeFor, viewMatch, type VersusAction } from "@/server/versus/service";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["sync", "join", "pick", "move", "leave", "rematch"]);

/** Read a match (spectators and finished matches). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  return handleLive(req, async (ctx) => ok(await viewMatch((await params).code, ctx.user?.id ?? null)));
}

/** Every match interaction: join, sync, pick, move, leave (forfeit), rematch. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    const body = (await req.json().catch(() => null)) as VersusAction | null;
    if (!body || typeof body !== "object" || !ACTIONS.has(body.action)) throw new EngineError("INVALID_INPUT");
    if (!rateLimit(`versus:${user.id}`, 60, 10_000)) throw new EngineError("RATE_LIMITED");
    const snap = await matchRequest((await params).code, user.id, body);
    if (snap.phase === "FINISHED" && snap.mode === "ranked") {
      snap.ratingChange = await ratingChangeFor(snap.code, snap.createdAt, snap.seats.map((s) => s.userId));
    }
    return ok(snap);
  });
}
