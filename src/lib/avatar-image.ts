import "server-only";
import sharp from "sharp";

/** Largest file accepted (Vercel caps request bodies at 4.5 MB). */
export const AVATAR_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Largest stored picture (animated pictures can be bigger than stills). */
const MAX_STORED_BYTES = 1_500_000;
const SIZE = 256;
const MAX_FRAMES = 150;

export type AvatarImageError = "TOO_LARGE" | "UNSUPPORTED" | "INVALID";

export class AvatarImageProblem extends Error {
  constructor(public reason: AvatarImageError) {
    super(reason);
  }
}

/** Recognises the file by its first bytes, not by its name or the browser's claim. */
function sniff(buf: Buffer): "jpeg" | "png" | "gif" | "webp" | "avif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return "gif";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp" && /avif|avis/.test(buf.subarray(8, 12).toString("ascii"))) return "avif";
  return null;
}

/**
 * Turns an uploaded picture into a square 256×256 WebP. Re-encoding drops
 * all metadata (EXIF location, camera data…) and anything that is not
 * picture data. Animated GIF/WebP pictures stay animated.
 */
export async function processAvatarImage(input: Buffer): Promise<{ data: Buffer; mime: "image/webp" }> {
  if (input.length > AVATAR_MAX_UPLOAD_BYTES) throw new AvatarImageProblem("TOO_LARGE");
  const kind = sniff(input);
  if (!kind) throw new AvatarImageProblem("UNSUPPORTED");
  const mayAnimate = kind === "gif" || kind === "webp";

  try {
    const meta = await sharp(input, { animated: mayAnimate, limitInputPixels: 40_000_000 }).metadata();
    const animated = mayAnimate && (meta.pages ?? 1) > 1;
    if (animated && (meta.pages ?? 1) > MAX_FRAMES) throw new AvatarImageProblem("TOO_LARGE");

    const encode = async (quality: number) => {
      let img = sharp(input, { animated, limitInputPixels: 40_000_000 });
      if (!animated) img = img.rotate(); // honour the phone's orientation flag
      return img
        .resize(SIZE, SIZE, { fit: "cover", position: animated ? "centre" : "attention" })
        .webp({ quality, effort: 4 })
        .toBuffer();
    };

    let out = await encode(82);
    if (out.length > MAX_STORED_BYTES) out = await encode(55);
    if (out.length > MAX_STORED_BYTES) throw new AvatarImageProblem("TOO_LARGE");
    return { data: out, mime: "image/webp" };
  } catch (err) {
    if (err instanceof AvatarImageProblem) throw err;
    throw new AvatarImageProblem("INVALID");
  }
}
