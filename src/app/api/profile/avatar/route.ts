import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { isSameOrigin, jsonError, rateLimit } from "@/lib/http";
import { getServerLocale } from "@/lib/i18n-server";
import { AVATAR_MAX_UPLOAD_BYTES, AvatarImageProblem, processAvatarImage, type AvatarImageError } from "@/lib/avatar-image";

export const dynamic = "force-dynamic";
// Image processing needs Node (sharp), not the edge runtime.
export const runtime = "nodejs";

const MESSAGES: Record<"tr" | "en", Record<AvatarImageError | "NO_FILE" | "RATE" | "AUTH", string>> = {
  tr: {
    AUTH: "Fotoğraf yüklemek için giriş yapmalısın.",
    RATE: "Çok sık fotoğraf değiştirdin. Biraz bekleyip tekrar dene.",
    NO_FILE: "Bir fotoğraf seç.",
    TOO_LARGE: "Fotoğraf çok büyük. En fazla 4 MB olabilir (hareketli GIF'lerde daha kısa bir GIF dene).",
    UNSUPPORTED: "Bu dosya türü desteklenmiyor. JPG, PNG, WebP, GIF veya AVIF seç.",
    INVALID: "Fotoğraf okunamadı. Başka bir fotoğraf dene.",
  },
  en: {
    AUTH: "Please sign in to upload a picture.",
    RATE: "You changed your picture too often. Please wait a bit.",
    NO_FILE: "Choose a picture.",
    TOO_LARGE: "The picture is too large. Up to 4 MB (for animated GIFs, try a shorter one).",
    UNSUPPORTED: "This file type isn't supported. Choose a JPG, PNG, WebP, GIF or AVIF.",
    INVALID: "The picture couldn't be read. Try another one.",
  },
};

/** Upload a profile picture from the device (multipart form field "file"). */
export async function POST(req: NextRequest) {
  const m = MESSAGES[await getServerLocale()];
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError(m.AUTH, 401);
  if (!rateLimit(`avatar-upload:${user.id}`, 10, 60 * 60_000)) return jsonError(m.RATE, 429);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > AVATAR_MAX_UPLOAD_BYTES + 64 * 1024) return jsonError(m.TOO_LARGE, 413);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return jsonError(m.NO_FILE);
  if (file.size > AVATAR_MAX_UPLOAD_BYTES) return jsonError(m.TOO_LARGE, 413);

  try {
    const processed = await processAvatarImage(Buffer.from(await file.arrayBuffer()));
    const data = new Uint8Array(processed.data);
    const mime = processed.mime;
    await prisma.userAvatarImage.upsert({
      where: { userId: user.id },
      create: { userId: user.id, data, mime },
      update: { data, mime },
    });
    // A new URL every time, so browsers and caches show the new picture right away.
    const url = `/api/avatar/${user.id}?v=${Date.now().toString(36)}`;
    await prisma.user.update({ where: { id: user.id }, data: { avatarCustomUrl: url } });
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    if (err instanceof AvatarImageProblem) return jsonError(m[err.reason], err.reason === "TOO_LARGE" ? 413 : 400);
    console.error("[avatar] upload failed", err);
    return jsonError(m.INVALID, 500);
  }
}

/** Remove the uploaded picture (back to the emblem or character avatar). */
export async function DELETE(req: NextRequest) {
  const m = MESSAGES[await getServerLocale()];
  if (!isSameOrigin(req)) return jsonError("Cross-site request blocked.", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError(m.AUTH, 401);
  await prisma.userAvatarImage.deleteMany({ where: { userId: user.id } });
  await prisma.user.update({ where: { id: user.id }, data: { avatarCustomUrl: null } });
  return NextResponse.json({ ok: true });
}
