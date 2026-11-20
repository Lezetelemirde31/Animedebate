import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { AVATAR_MAX_UPLOAD_BYTES, AvatarImageProblem, processAvatarImage } from "@/lib/avatar-image";

async function reason(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AvatarImageProblem) return err.reason;
    throw err;
  }
  throw new Error("expected a rejection");
}

describe("profile picture processing", () => {
  it("turns a large photo into a 256×256 WebP and drops its metadata (e.g. GPS)", async () => {
    const photo = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#3366cc" } })
      .jpeg()
      .withExif({ IFD0: { Artist: "secret", ImageDescription: "home location" } })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeTruthy();

    const out = await processAvatarImage(photo);
    expect(out.mime).toBe("image/webp");
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(meta.exif).toBeUndefined();
    expect(out.data.length).toBeLessThan(50_000);
  });

  it("keeps animated GIFs animated", async () => {
    const frame = (c: string) => sharp({ create: { width: 64, height: 64, channels: 3, background: c } }).png().toBuffer();
    const gif = await sharp([await frame("#ff0000"), await frame("#00ff00"), await frame("#0000ff")], { join: { animated: true } })
      .gif()
      .toBuffer();
    expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(3);

    const out = await processAvatarImage(gif);
    const meta = await sharp(out.data, { animated: true }).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.pages).toBe(3);
    expect(meta.width).toBe(256);
  });

  it("rejects files that are not pictures, broken pictures and oversized uploads", async () => {
    expect(await reason(processAvatarImage(Buffer.from("<script>alert(1)</script> not an image at all")))).toBe("UNSUPPORTED");
    const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
    expect(await reason(processAvatarImage(fakePng))).toBe("INVALID");
    expect(await reason(processAvatarImage(Buffer.alloc(AVATAR_MAX_UPLOAD_BYTES + 1)))).toBe("TOO_LARGE");
  });
});
