import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import sharp from "sharp";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_MEGABYTES,
  PHOTO_FULL_EDGE,
  PHOTO_THUMB_HEIGHT,
  PHOTO_THUMB_WIDTH,
} from "@/lib/recipe-photo-shared";

/**
 * Turning an uploaded file into what the database keeps.
 *
 * Nothing that was uploaded is stored or served as it came in: it is decoded and
 * encoded again. That checks that it really is an image (the browser's file type
 * says nothing), drops metadata such as the GPS position a phone writes into its
 * photos, and makes the bytes something this app produced, never a script or an
 * SVG. The limits and sizes it works to are in lib/recipe-photo-shared.ts.
 */

/** Bounds the memory decoding takes: a 5 MB PNG can hold hundreds of megapixels. */
const MAX_INPUT_PIXELS = 40_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const WEBP_QUALITY = 75;

export type ProcessedPhoto = {
  full: Buffer;
  fullWidth: number;
  fullHeight: number;
  thumb: Buffer;
};

/** The upload processed, or what is wrong with it, as a message for the form to translate. */
export type PhotoResult = { photo: ProcessedPhoto } | { error: MessageDescriptor };

export async function processPhoto(file: File): Promise<PhotoResult> {
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: msg`The photo is too large: ${MAX_PHOTO_MEGABYTES} MB at most.` };
  }
  const input = Buffer.from(await file.arrayBuffer());

  try {
    const { format, width = 0, height = 0 } = await sharp(input, { limitInputPixels: false }).metadata();
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      return { error: msg`The photo has to be a JPEG, PNG or WebP image.` };
    }
    if (width * height > MAX_INPUT_PIXELS) {
      return { error: msg`The photo has too many pixels. Choose a smaller image.` };
    }

    // `rotate()` applies the orientation the camera recorded, which the re-encoding then no longer carries.
    const { data: full, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: PHOTO_FULL_EDGE, height: PHOTO_FULL_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    // The thumbnail comes from the image just made, not from the upload: the big original is decoded
    // once, which halves the peak memory for a huge photo, and 1200 px is plenty to crop 480 x 320 from.
    const thumb = await sharp(full)
      .resize(PHOTO_THUMB_WIDTH, PHOTO_THUMB_HEIGHT, { fit: "cover" })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    return { photo: { full, fullWidth: info.width, fullHeight: info.height, thumb } };
  } catch {
    return { error: msg`The photo could not be read. Choose another image.` };
  }
}
