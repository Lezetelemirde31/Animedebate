import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import { awardXp } from "@/lib/gamification";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

const rewardSchema = z.object({
  won: z.boolean(),
  roundsPlayed: z.number().int().min(3).max(5),
});

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentication required.", 401);

  // Cooldown against scripted reward spam (max 1 bot reward every 12 seconds, up to 30/hr)
  if (!rateLimit(`arena:bot-cooldown:${user.id}`, 1, 12_000)) {
    return jsonError("Cooldown active.", 429);
  }
  if (!rateLimit(`arena:bot-hourly:${user.id}`, 30, 60 * 60_000)) {
    return jsonError("Hourly bot reward cap reached.", 429);
  }

  const parsed = rewardSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid payload.", 400);

  const amount = parsed.data.won ? 15 : 5;
  const result = await awardXp({
    userId: user.id,
    amount,
    reason: parsed.data.won ? "ARENA_BOT_WIN" : "ARENA_BOT_PLAY",
    refType: "ARENA_BOT",
  });

  return NextResponse.json({
    ok: true,
    xpAwarded: amount,
    xp: result.xp,
    level: result.level,
    leveledUp: result.leveledUp,
  });
}
