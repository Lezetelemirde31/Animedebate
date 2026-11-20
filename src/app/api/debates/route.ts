import { NextResponse, type NextRequest } from "next/server";
import type { DebateCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { awardXp, XP_REWARDS } from "@/lib/gamification";
import { sanitizeText, slugifyTitle } from "@/lib/sanitize";
import { createDebateSchema, firstIssue } from "@/lib/validation";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") as DebateCategory | null;
  const animeId = searchParams.get("animeId");
  const q = searchParams.get("q")?.trim();
  const sort = searchParams.get("sort") ?? "recent";

  const where: Record<string, unknown> = { status: { not: "HIDDEN" } };
  if (category && ["GENERAL", "POWER_SCALING", "LORE", "HOT_TAKE"].includes(category)) where.category = category;
  if (animeId) where.animeId = animeId;
  if (q) where.title = { contains: q, mode: "insensitive" };

  const orderBy =
    sort === "popular"
      ? [{ isPinned: "desc" as const }, { likesCount: "desc" as const }, { createdAt: "desc" as const }]
      : sort === "discussed"
        ? [{ isPinned: "desc" as const }, { commentsCount: "desc" as const }, { createdAt: "desc" as const }]
        : [{ isPinned: "desc" as const }, { createdAt: "desc" as const }];

  const debates = await prisma.debate.findMany({
    where,
    orderBy,
    take: 50,
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
      anime: { select: { id: true, shortName: true, color: true } },
      character: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  return NextResponse.json({ ok: true, debates });
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in to start a debate.", 401);
  if (!rateLimit(`debate:create:${user.id}`, 10, 15 * 60_000)) {
    return jsonError("You are posting too quickly. Please wait a few minutes.", 429);
  }

  const parsed = createDebateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const title = sanitizeText(parsed.data.title);
  const content = sanitizeText(parsed.data.content);
  if (title.length < 6 || content.length < 15) {
    return jsonError("Please provide a valid title and debate body.");
  }

  if (parsed.data.characterId) {
    const ch = await prisma.character.findUnique({ where: { id: parsed.data.characterId }, select: { id: true, enabled: true } });
    if (!ch || !ch.enabled) return jsonError("Selected character was not found.");
  }

  const debate = await prisma.debate.create({
    data: {
      slug: slugifyTitle(title),
      authorId: user.id,
      title,
      content,
      category: parsed.data.category,
      animeId: parsed.data.animeId ?? null,
      characterId: parsed.data.characterId ?? null,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { debatesCount: { increment: 1 } },
  });
  await awardXp({
    userId: user.id,
    amount: XP_REWARDS.CREATE_DEBATE,
    reason: "Created a community debate",
    refType: "DEBATE",
    refId: debate.id,
  });

  return NextResponse.json({ ok: true, debate }, { status: 201 });
}
