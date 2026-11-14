import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { isAvatarStyle } from "@/lib/avatars";
import { firstIssue, updateProfileSchema } from "@/lib/validation";
import { isSameOrigin, jsonError } from "@/lib/http";

/** Update profile picture: a preset style and/or an owned character. */
export async function PATCH(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);
  const parsed = updateProfileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));
  const { avatarStyle, avatarCharacterId } = parsed.data;

  const data: { avatarStyle?: string; avatarCharacterId?: string | null } = {};
  if (avatarStyle !== undefined) {
    if (!isAvatarStyle(avatarStyle)) return jsonError("Unknown avatar style.");
    data.avatarStyle = avatarStyle;
  }
  if (avatarCharacterId !== undefined) {
    if (avatarCharacterId !== null) {
      // You can only wear characters you actually own.
      const owned = await prisma.ownedCharacter.findUnique({
        where: { userId_characterId: { userId: user.id, characterId: avatarCharacterId } },
      });
      if (!owned) return jsonError("You can only use characters from your collection.", 403);
    }
    data.avatarCharacterId = avatarCharacterId;
  }
  await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json({ ok: true });
}
