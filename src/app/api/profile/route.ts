import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { isAvatarStyle } from "@/lib/avatars";
import { sanitizeText } from "@/lib/sanitize";
import { firstIssue, updateProfileSchema } from "@/lib/validation";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";

const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Update profile: username, bio, preset avatar style, or owned character avatar. */
export async function PATCH(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("Please sign in.", 401);
  if (!rateLimit(`profile:${user.id}`, 25, 10 * 60_000)) {
    return jsonError("Too many profile updates. Please wait a bit.", 429);
  }

  const parsed = updateProfileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error));
  const { username, bio, avatarStyle, avatarCharacterId } = parsed.data;

  const currentRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { username: true, usernameKey: true, usernameChangedAt: true, role: true },
  });
  if (!currentRecord) return jsonError("Account not found.", 404);

  const data: {
    username?: string;
    usernameKey?: string;
    usernameChangedAt?: Date;
    bio?: string | null;
    avatarStyle?: string;
    avatarCharacterId?: string | null;
    avatarCustomUrl?: string | null;
  } = {};

  if (username !== undefined && username !== currentRecord.username) {
    const nextKey = username.toLowerCase();
    if (
      currentRecord.role !== "ADMIN" &&
      nextKey !== currentRecord.usernameKey &&
      currentRecord.usernameChangedAt &&
      Date.now() - currentRecord.usernameChangedAt.getTime() < USERNAME_COOLDOWN_MS
    ) {
      const daysLeft = Math.ceil((USERNAME_COOLDOWN_MS - (Date.now() - currentRecord.usernameChangedAt.getTime())) / 86_400_000);
      return jsonError(`You can change your username again in ${daysLeft} day(s).`, 429);
    }
    const existing = await prisma.user.findUnique({ where: { usernameKey: nextKey }, select: { id: true } });
    if (existing && existing.id !== user.id) {
      return jsonError("That username is already taken.", 409);
    }
    data.username = username;
    data.usernameKey = nextKey;
    if (nextKey !== currentRecord.usernameKey) {
      data.usernameChangedAt = new Date();
    }
  }

  if (bio !== undefined) {
    const cleanBio = bio === null ? null : sanitizeText(bio);
    data.bio = cleanBio ? cleanBio : null;
  }

  if (avatarStyle !== undefined) {
    if (!isAvatarStyle(avatarStyle)) return jsonError("Unknown avatar style.");
    data.avatarStyle = avatarStyle;
  }

  if (avatarCharacterId !== undefined) {
    if (avatarCharacterId !== null) {
      const owned = await prisma.ownedCharacter.findUnique({
        where: { userId_characterId: { userId: user.id, characterId: avatarCharacterId } },
      });
      if (!owned) return jsonError("You can only use characters from your collection.", 403);
    }
    data.avatarCharacterId = avatarCharacterId;
  }

  // Picking an emblem or a character replaces an uploaded picture.
  const replacesUpload = avatarStyle !== undefined || avatarCharacterId !== undefined;
  if (replacesUpload) data.avatarCustomUrl = null;

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: { id: true, username: true, bio: true, avatarStyle: true, avatarCharacterId: true },
    });
    if (replacesUpload) await prisma.userAvatarImage.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ ok: true, user: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return jsonError("That username is already taken.", 409);
    }
    throw err;
  }
}
