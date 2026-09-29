import sharp, { type Sharp } from "sharp";

/** A plain image of the given size, for tests that need a real upload. */
export async function testImage(
  format: "jpeg" | "png" | "webp" | "gif" | "tiff",
  width = 200,
  height = 100,
  edit: (image: Sharp) => Sharp = (image) => image,
): Promise<Buffer> {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 90, b: 40 } } });
  return edit(base)[format]().toBuffer();
}

/** Wrap bytes as the `File` a form upload delivers. */
export function asFile(bytes: Buffer | Uint8Array, name = "photo.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}
