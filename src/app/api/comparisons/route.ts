import { NextResponse, type NextRequest } from "next/server";
import type { ComparisonCriteria } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { awardXp, XP_REWARDS } from "@/lib/gamification";
import { sanitizeText, slugifyTitle } from "@/lib/sanitize";
import { createComparisonSchema, firstIssue } from "@/lib/validation";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const criteria = searchParams.get("criteria") as ComparisonCriteria | null;

  const where: Record<string, unknown> = { status: { not: "HIDDEN" } };
  if (criteria && ["OVERALL", "COMBAT", "WRITING", "INTELLIGENCE"].includes(criteria)) {
    where.criteria = criteria;
  }

  const comparisons = await prisma.characterComparison.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      author: {
        select: {
          id: true,
          username: true,
          level: true,
          avatarStyle: true,
          avatarCustomUrl: true,
          avatarCharacter: { select: { imageUrl: true } },
        },
      },
      characterA: { include: { anime: { select: { shortName: true, color: true } } } },
      characterB: { include: { anime: { select: { shortName: true, color: true } } } },
    },
  });

  return NextResponse.json({ ok: true, comparisons });
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in to create a comparison.", 401);
  if (!rateLimit(`comp:create:${user.id}`, 10, 15 * 60_000)) {
    return jsonError("Too many comparisons created. Please wait a few minutes.", 429);
  }

  const parsed = createComparisonSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const [charA, charB] = await Promise.all([
    prisma.character.findUnique({ where: { id: parsed.data.characterAId }, select: { id: true, enabled: true } }),
    prisma.character.findUnique({ where: { id: parsed.data.characterBId }, select: { id: true, enabled: true } }),
  ]);
  if (!charA?.enabled || !charB?.enabled) {
    return jsonError("Both selected characters must exist and be active.", 400);
  }

  const title = sanitizeText(parsed.data.title);
  const description = sanitizeText(parsed.data.description);
  const comparison = await prisma.characterComparison.create({
    data: {
      slug: slugifyTitle(title),
      authorId: user.id,
      characterAId: charA.id,
      characterBId: charB.id,
      title,
      description,
      criteria: parsed.data.criteria,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { comparisonsCount: { increment: 1 } },
  });
  await awardXp({
    userId: user.id,
    amount: XP_REWARDS.CREATE_COMPARISON,
    reason: "Created a character VS comparison",
    refType: "COMPARISON",
    refId: comparison.id,
  });

  return NextResponse.json({ ok: true, comparison }, { status: 201 });
}
