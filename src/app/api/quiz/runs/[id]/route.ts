import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { quizRunRequest, type QuizRunAction } from "@/server/quiz/solo";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["sync", "answer", "joker", "next", "quit"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    const body = (await req.json().catch(() => null)) as QuizRunAction | null;
    if (!body || typeof body !== "object" || !ACTIONS.has(body.action)) throw new EngineError("INVALID_INPUT");
    if (!rateLimit(`quiz-act:${user.id}`, 40, 10_000)) throw new EngineError("RATE_LIMITED");
    return ok(await quizRunRequest((await params).id, user.id, body));
  });
}
