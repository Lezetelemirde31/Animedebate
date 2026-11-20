import type { NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/http";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { createQuizRoom, type QuizRaceSettings } from "@/server/quiz/race";

export const dynamic = "force-dynamic";

/** Open a friendly quiz race room. */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    if (!rateLimit(`quiz-room:${user.id}:${clientIp(req)}`, 20, 10 * 60_000)) throw new EngineError("RATE_LIMITED");
    const body = (await req.json().catch(() => null)) as { settings?: Partial<QuizRaceSettings> } | null;
    return ok({ code: await createQuizRoom(user.id, body?.settings) });
  });
}
