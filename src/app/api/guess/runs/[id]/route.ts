import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { runRequest, type RunAction } from "@/server/guess/solo";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["sync", "guess", "hint", "next", "quit"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    const body = (await req.json().catch(() => null)) as RunAction | null;
    if (!body || typeof body !== "object" || !ACTIONS.has(body.action)) throw new EngineError("INVALID_INPUT");
    if (!rateLimit(`guess-act:${user.id}`, 40, 10_000)) throw new EngineError("RATE_LIMITED");
    return ok(await runRequest((await params).id, user.id, body));
  });
}
