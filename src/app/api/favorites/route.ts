import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { favoriteSchema, firstIssue } from "@/lib/validation";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      character: { include: { anime: { select: { name: true, shortName: true } } } },
      debate: { include: { author: { select: { username: true } }, anime: { select: { shortName: true, color: true } } } },
      comparison: {
        include: {
          characterA: { select: { id: true, name: true, imageUrl: true, animeId: true } },
          characterB: { select: { id: true, name: true, imageUrl: true, animeId: true } },
        },
      },
    },
  });
  return NextResponse.json({ ok: true, favorites });
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in to save favorites.", 401);
  if (!rateLimit(`fav:${user.id}`, 60, 60_000)) return jsonError("Slow down a moment.", 429);

  const parsed = favoriteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const { targetType, targetId } = parsed.data;
  const existing =
    targetType === "CHARACTER"
      ? await prisma.favorite.findUnique({ where: { userId_characterId: { userId: user.id, characterId: targetId } } })
      : targetType === "DEBATE"
        ? await prisma.favorite.findUnique({ where: { userId_debateId: { userId: user.id, debateId: targetId } } })
        : await prisma.favorite.findUnique({ where: { userId_comparisonId: { userId: user.id, comparisonId: targetId } } });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, favorited: false });
  }

  if (targetType === "CHARACTER") {
    const ch = await prisma.character.findUnique({ where: { id: targetId }, select: { id: true, enabled: true } });
    if (!ch?.enabled) return jsonError("Character not found.", 404);
  } else if (targetType === "DEBATE") {
    const d = await prisma.debate.findUnique({ where: { id: targetId }, select: { id: true, status: true } });
    if (!d || d.status === "HIDDEN") return jsonError("Debate not found.", 404);
  } else {
    const c = await prisma.characterComparison.findUnique({ where: { id: targetId }, select: { id: true, status: true } });
    if (!c || c.status === "HIDDEN") return jsonError("Comparison not found.", 404);
  }

  await prisma.favorite.create({
    data: {
      userId: user.id,
      characterId: targetType === "CHARACTER" ? targetId : null,
      debateId: targetType === "DEBATE" ? targetId : null,
      comparisonId: targetType === "COMPARISON" ? targetId : null,
    },
  });
  return NextResponse.json({ ok: true, favorited: true });
}
