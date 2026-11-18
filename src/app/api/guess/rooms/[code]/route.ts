import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { raceRequest, viewRace, type RaceAction } from "@/server/guess/race";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["sync", "join", "leave", "start", "settings", "guess", "rematch"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  return handleLive(req, async (ctx) => ok(await viewRace((await params).code, ctx.user?.id ?? null)));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    const body = (await req.json().catch(() => null)) as RaceAction | null;
    if (!body || typeof body !== "object" || !ACTIONS.has(body.action)) throw new EngineError("INVALID_INPUT");
    if (!rateLimit(`guess-race:${user.id}`, 60, 10_000)) throw new EngineError("RATE_LIMITED");
    return ok(await raceRequest((await params).code, user.id, body));
  });
}
