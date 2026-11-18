import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/http";
import { isDifficulty, isRunMode } from "@/game/guess/rules";
import { isEnabledAnime } from "@/data/anime";
import { EngineError } from "@/server/live/room";
import { handleLive, ok } from "@/server/live/http";
import { startDailyRun, startSoloRun } from "@/server/guess/solo";

export const dynamic = "force-dynamic";

/** Start a solo run (`{ kind: "solo", mode, difficulty, animeId }`) or open today's challenge (`{ kind: "daily" }`). */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    if (!rateLimit(`guess-run:${user.id}`, 30, 10 * 60_000)) throw new EngineError("RATE_LIMITED");
    const body = (await req.json().catch(() => null)) as { kind?: unknown; mode?: unknown; difficulty?: unknown; animeId?: unknown } | null;
    if (body?.kind === "daily") return ok({ id: await startDailyRun(user.id) });
    if (body?.kind === "solo") {
      const animeId = typeof body.animeId === "string" && isEnabledAnime(body.animeId) ? body.animeId : null;
      return ok({
        id: await startSoloRun(user.id, {
          mode: isRunMode(body.mode) ? body.mode : "MIXED",
          difficulty: isDifficulty(body.difficulty) ? body.difficulty : "NORMAL",
          animeId,
        }),
      });
    }
    throw new EngineError("INVALID_INPUT");
  });
}
