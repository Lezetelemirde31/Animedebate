import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { awardXp, XP_REWARDS } from "@/lib/gamification";
import { firstIssue, voteComparisonSchema } from "@/lib/validation";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in to vote.", 401);
  if (!rateLimit(`comp:vote:${user.id}`, 40, 60_000)) {
    return jsonError("Slow down a moment.", 429);
  }

  const { id } = await params;
  const comp = await prisma.characterComparison.findUnique({ where: { id } });
  if (!comp || comp.status === "HIDDEN") return jsonError("Comparison not found.", 404);
  if (comp.status === "LOCKED") return jsonError("Voting is locked on this comparison.", 403);

  const parsed = voteComparisonSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));
  const { side } = parsed.data;

  const existing = await prisma.comparisonVote.findUnique({
    where: { comparisonId_userId: { comparisonId: id, userId: user.id } },
  });

  if (!existing) {
    await prisma.$transaction(async (tx) => {
      await tx.comparisonVote.create({ data: { comparisonId: id, userId: user.id, side } });
      await tx.characterComparison.update({
        where: { id },
        data: side === "A" ? { votesACount: { increment: 1 } } : { votesBCount: { increment: 1 } },
      });
    });
    await awardXp({
      userId: user.id,
      amount: XP_REWARDS.VOTE_COMPARISON,
      reason: "Voted in a character comparison",
      refType: "COMPARISON",
      refId: id,
    });
  } else if (existing.side !== side) {
    await prisma.$transaction(async (tx) => {
      await tx.comparisonVote.update({ where: { id: existing.id }, data: { side } });
      await tx.characterComparison.update({
        where: { id },
        data:
          side === "A"
            ? { votesACount: { increment: 1 }, votesBCount: { decrement: 1 } }
            : { votesBCount: { increment: 1 }, votesACount: { decrement: 1 } },
      });
    });
  }

  const updated = await prisma.characterComparison.findUnique({
    where: { id },
    select: { votesACount: true, votesBCount: true },
  });
  return NextResponse.json({
    ok: true,
    side,
    votesACount: updated?.votesACount ?? 0,
    votesBCount: updated?.votesBCount ?? 0,
  });
}
