import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { quizRaceRequest, viewQuizRace, type QuizRaceAction } from "@/server/quiz/race";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["sync", "join", "leave", "start", "settings", "answer", "rematch"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  return handleLive(req, async (ctx) => ok(await viewQuizRace((await params).code, ctx.user?.id ?? null)));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    const body = (await req.json().catch(() => null)) as QuizRaceAction | null;
    if (!body || typeof body !== "object" || !ACTIONS.has(body.action)) throw new EngineError("INVALID_INPUT");
    if (!rateLimit(`quiz-race:${user.id}`, 60, 10_000)) throw new EngineError("RATE_LIMITED");
    return ok(await quizRaceRequest((await params).code, user.id, body));
  });
}
