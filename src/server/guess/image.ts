/**
 * Disguised character pictures for "Who Is This Character?".
 *
 * The original artwork is fetched and transformed on the server and sent as a
 * fresh WebP without metadata, so the response can't be traced back to the
 * character's image address.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type Sharp } from "sharp";
import type { GuessMode } from "@/game/guess/rules";

const W = 300;
const H = 400;

// Strength per effect level (0 = strongest disguise … 4 = lightest).
const BLUR = [44, 34, 22, 14, 8];
const PIXEL = [5, 7, 10, 15, 24];
const SHADOW_BLUR = [12, 9, 5, 2.5, 1];
const EYES_WIDTH = [0.22, 0.3, 0.42, 0.6, 0.85];

interface Cache<T> {
  map: Map<string, T>;
  max: number;
}
const g = globalThis as unknown as { __aaGuessOriginals?: Cache<Promise<Buffer>>; __aaGuessRendered?: Cache<Promise<Buffer>> };
const originals = (g.__aaGuessOriginals ??= { map: new Map(), max: 220 });
const rendered = (g.__aaGuessRendered ??= { map: new Map(), max: 600 });

function remember<T>(cache: Cache<Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  const hit = cache.map.get(key);
  if (hit) {
    cache.map.delete(key);
    cache.map.set(key, hit);
    return hit;
  }
  const p = make();
  cache.map.set(key, p);
  p.catch(() => cache.map.delete(key));
  while (cache.map.size > cache.max) cache.map.delete(cache.map.keys().next().value as string);
  return p;
}

async function loadOriginal(imageUrl: string, origin: string | null): Promise<Buffer> {
  if (imageUrl.startsWith("/")) {
    // Files under public/: read from disk when available, else from this site.
    const local = path.join(process.cwd(), "public", path.normalize(imageUrl).replace(/^([/\\])+/, ""));
    try {
      return await fs.readFile(local);
    } catch {
      if (!origin) throw new Error("image not found");
      imageUrl = new URL(imageUrl, origin).toString();
    }
  }
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The artwork cropped to the game's portrait frame (cached). */
function base(imageUrl: string, origin: string | null): Promise<Buffer> {
  return remember(originals, imageUrl, async () => {
    const raw = await loadOriginal(imageUrl, origin);
    return sharp(raw).rotate().resize(W, H, { fit: "cover", position: "top" }).removeAlpha().png().toBuffer();
  });
}

async function applyEffect(img: Buffer, mode: GuessMode, level: number): Promise<Sharp> {
  const l = Math.max(0, Math.min(4, level));
  switch (mode) {
    case "BLUR":
      return sharp(img).blur(BLUR[l]);
    case "PIXEL": {
      const w = PIXEL[l];
      const small = await sharp(img).resize(w, Math.round((w * H) / W), { kernel: "cubic" }).toBuffer();
      return sharp(small).resize(W, H, { kernel: "nearest" });
    }
    case "SHADOW":
      return sharp(img).grayscale().blur(SHADOW_BLUR[l]).threshold(115);
    case "EYES": {
      const w = Math.round(W * EYES_WIDTH[l]);
      const h = Math.round(w * 0.75);
      const left = Math.round((W - w) / 2);
      const top = Math.max(0, Math.min(H - h, Math.round(H * 0.36 - h / 2)));
      return sharp(img).extract({ left, top, width: w, height: h }).resize(W, Math.round(W * 0.75), { kernel: "lanczos3" });
    }
  }
}

/** A disguised picture as WebP. `level` comes from `effectLevel(stage, difficulty)`. */
export function renderGuessImage(imageUrl: string, mode: GuessMode, level: number, origin: string | null = null): Promise<Buffer> {
  return remember(rendered, `${imageUrl}|${mode}|${level}`, async () => {
    const img = await base(imageUrl, origin);
    return (await applyEffect(img, mode, level)).webp({ quality: 78 }).toBuffer();
  });
}
