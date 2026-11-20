import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { isQuizDifficulty } from "@/game/quiz/rules";
import { isEnabledAnime } from "@/data/anime";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { startDailyQuiz, startQuizRun } from "@/server/quiz/solo";

export const dynamic = "force-dynamic";

/** Start a solo quiz (`{ kind: "solo", difficulty, animeId }`) or open today's quiz (`{ kind: "daily" }`). */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    if (!rateLimit(`quiz-run:${user.id}`, 30, 10 * 60_000)) throw new EngineError("RATE_LIMITED");
    const body = (await req.json().catch(() => null)) as { kind?: unknown; difficulty?: unknown; animeId?: unknown } | null;
    if (body?.kind === "daily") return ok({ id: await startDailyQuiz(user.id) });
    if (body?.kind === "solo") {
      const animeId = typeof body.animeId === "string" && isEnabledAnime(body.animeId) ? body.animeId : null;
      return ok({ id: await startQuizRun(user.id, { difficulty: isQuizDifficulty(body.difficulty) ? body.difficulty : "MIXED", animeId }) });
    }
    throw new EngineError("INVALID_INPUT");
  });
}
