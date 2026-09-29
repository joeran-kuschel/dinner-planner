import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processPhoto } from "@/lib/recipe-photo";
import {
  MAX_PHOTO_BYTES,
  PHOTO_FULL_EDGE,
  PHOTO_THUMB_HEIGHT,
  PHOTO_THUMB_WIDTH,
} from "@/lib/recipe-photo-shared";
import { asFile, testImage } from "@/tests/support/images";
import { testI18n } from "@/tests/support/i18n";

const i18n = testI18n("en");
const errorText = async (file: File) => {
  const result = await processPhoto(file);
  if (!("error" in result)) throw new Error("expected an error");
  return i18n._(result.error);
};
const photoOf = async (file: File) => {
  const result = await processPhoto(file);
  if (!("photo" in result)) throw new Error(`expected a photo, got: ${i18n._(result.error)}`);
  return result.photo;
};

describe("processPhoto", () => {
  it.each(["jpeg", "png", "webp"] as const)("accepts a %s and stores WebP", async (format) => {
    const photo = await photoOf(asFile(await testImage(format), `p.${format}`, `image/${format}`));

    expect((await sharp(photo.full).metadata()).format).toBe("webp");
    expect((await sharp(photo.thumb).metadata()).format).toBe("webp");
  });

  it("keeps a small image at its size", async () => {
    const photo = await photoOf(asFile(await testImage("png", 300, 200)));
    expect([photo.fullWidth, photo.fullHeight]).toEqual([300, 200]);
  });

  it("scales a large image down to the long edge, keeping its proportions", async () => {
    const photo = await photoOf(asFile(await testImage("jpeg", 3000, 2000)));
    expect([photo.fullWidth, photo.fullHeight]).toEqual([PHOTO_FULL_EDGE, 800]);
    const meta = await sharp(photo.full).metadata();
    expect([meta.width, meta.height]).toEqual([PHOTO_FULL_EDGE, 800]);
  });

  it("scales a tall image down by its height", async () => {
    const photo = await photoOf(asFile(await testImage("jpeg", 1500, 3000)));
    expect([photo.fullWidth, photo.fullHeight]).toEqual([600, PHOTO_FULL_EDGE]);
  });

  it("makes the thumbnail a fixed 3:2 crop, whatever the photo's shape", async () => {
    for (const [width, height] of [
      [3000, 2000],
      [1000, 1000],
      [800, 2400],
    ]) {
      const photo = await photoOf(asFile(await testImage("jpeg", width, height)));
      const meta = await sharp(photo.thumb).metadata();
      expect([meta.width, meta.height]).toEqual([PHOTO_THUMB_WIDTH, PHOTO_THUMB_HEIGHT]);
    }
  });

  it("stands a photo up that the camera recorded on its side", async () => {
    const sideways = await testImage("jpeg", 400, 200, (image) => image.withMetadata({ orientation: 6 }));
    const photo = await photoOf(asFile(sideways));
    expect([photo.fullWidth, photo.fullHeight]).toEqual([200, 400]);
  });

  it("drops the metadata of the upload, such as its EXIF data", async () => {
    const tagged = await testImage("jpeg", 400, 200, (image) =>
      image.withExif({ IFD0: { Copyright: "Somebody", ImageDescription: "A secret place" } }),
    );
    expect((await sharp(tagged).metadata()).exif).toBeDefined();

    const photo = await photoOf(asFile(tagged));
    expect((await sharp(photo.full).metadata()).exif).toBeUndefined();
    expect((await sharp(photo.thumb).metadata()).exif).toBeUndefined();
    expect(photo.full.includes(Buffer.from("A secret place"))).toBe(false);
  });

  it("keeps the stored photo small", async () => {
    const photo = await photoOf(asFile(await testImage("png", 3000, 2000)));
    expect(photo.full.length).toBeLessThan(MAX_PHOTO_BYTES / 10);
    expect(photo.thumb.length).toBeLessThan(photo.full.length + 1);
  });

  it("does not trust the file's name or type: it is what the bytes say", async () => {
    const png = await testImage("png");
    const photo = await photoOf(asFile(png, "photo.exe", "application/octet-stream"));
    expect((await sharp(photo.full).metadata()).format).toBe("webp");
  });

  it.each(["gif", "tiff"] as const)("rejects a %s, which is an image but not one of the three", async (format) => {
    expect(await errorText(asFile(await testImage(format), `p.${format}`, `image/${format}`))).toBe(
      "The photo has to be a JPEG, PNG or WebP image.",
    );
  });

  it("rejects an SVG, even one that claims to be a PNG", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    );
    expect(await errorText(asFile(svg, "x.png", "image/png"))).toBe("The photo has to be a JPEG, PNG or WebP image.");
  });

  it("rejects bytes that are no image at all", async () => {
    expect(await errorText(asFile(Buffer.from("just some text"), "notes.jpg", "image/jpeg"))).toBe(
      "The photo could not be read. Choose another image.",
    );
  });

  it("rejects a file that is cut off in the middle", async () => {
    const whole = await testImage("jpeg", 800, 600);
    const cut = whole.subarray(0, Math.floor(whole.length / 3));
    expect(await errorText(asFile(cut))).toBe("The photo could not be read. Choose another image.");
  });

  it("rejects an empty file", async () => {
    expect(await errorText(asFile(Buffer.alloc(0)))).toBe("The photo could not be read. Choose another image.");
  });

  it("rejects a file over the size limit before reading it", async () => {
    const big = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "big.jpg", { type: "image/jpeg" });
    expect(await errorText(big)).toBe("The photo is too large: 5 MB at most.");
  });

  it("accepts a file exactly at the size limit", async () => {
    const image = await testImage("png", 100, 100);
    // Bytes after the image data are ignored by the decoder.
    const padded = Buffer.concat([image, Buffer.alloc(MAX_PHOTO_BYTES - image.length)]);
    expect(padded.length).toBe(MAX_PHOTO_BYTES);

    const photo = await photoOf(asFile(padded, "edge.png", "image/png"));
    expect([photo.fullWidth, photo.fullHeight]).toEqual([100, 100]);
  });

  it("rejects an image with too many pixels for its file size", async () => {
    // Mostly one colour, so this stays a few kilobytes; decoded it would be 50 megapixels.
    const huge = await testImage("png", 8000, 6250);
    expect(huge.length).toBeLessThan(MAX_PHOTO_BYTES);
    expect(await errorText(asFile(huge, "huge.png", "image/png"))).toBe(
      "The photo has too many pixels. Choose a smaller image.",
    );
  });

  it("explains its errors in German", async () => {
    const result = await processPhoto(asFile(Buffer.from("no image"), "x.jpg"));
    if (!("error" in result)) throw new Error("expected an error");
    expect(testI18n("de")._(result.error)).toBe("Das Foto konnte nicht gelesen werden. Wähle ein anderes Bild.");
  });
});
