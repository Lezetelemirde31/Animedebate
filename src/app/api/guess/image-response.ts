import "server-only";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { rateLimit } from "@/lib/http";
import { effectLevel, type Difficulty, type GuessMode } from "@/game/guess/rules";
import { EngineError } from "@/server/live/room";
import { renderGuessImage } from "@/server/guess/image";

type Target = { imageUrl: string; mode: GuessMode; difficulty: Difficulty };

/**
 * Serves a disguised picture. Only the signed-in player of the run/room gets
 * it, and only for stages they have reached; the response carries no hint of
 * the original image address.
 */
export async function imageResponse(req: NextRequest, find: (userId: string, round: number, stage: number) => Promise<Target>): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!rateLimit(`guess-img:${user.id}`, 120, 60_000)) return new Response("Too many requests", { status: 429 });
  const url = new URL(req.url);
  const round = Number(url.searchParams.get("r"));
  const stage = Number(url.searchParams.get("s"));
  try {
    const t = await find(user.id, round, stage);
    const img = await renderGuessImage(t.imageUrl, t.mode, effectLevel(stage, t.difficulty), url.origin);
    return new Response(new Uint8Array(img), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    if (err instanceof EngineError) return new Response(null, { status: err.code === "NOT_FOUND" ? 404 : err.code === "INVALID_INPUT" ? 400 : 403 });
    console.error("[guess] image failed", err);
    return new Response(null, { status: 502 });
  }
}
