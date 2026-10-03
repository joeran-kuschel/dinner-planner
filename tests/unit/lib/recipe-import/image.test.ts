import { describe, expect, it } from "vitest";
import { sniffPhotoType } from "@/lib/recipe-import/image";
import { testImage } from "@/tests/support/images";

describe("sniffPhotoType", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const)("knows a real %s by its first bytes", async (format, type) => {
    expect(sniffPhotoType(await testImage(format))).toBe(type);
  });

  it.each([
    ["gif", () => testImage("gif")],
    ["tiff", () => testImage("tiff")],
    ["html", async () => Buffer.from("<html><body>hi</body></html>")],
    ["svg", async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ["text", async () => Buffer.from("just words")],
    ["nothing", async () => Buffer.alloc(0)],
    ["a cut-off jpeg signature", async () => Buffer.from([0xff, 0xd8])],
    ["RIFF that is no WebP", async () => Buffer.from("RIFF....WAVE")],
  ])("does not take %s for a photo", async (_label, make) => {
    expect(sniffPhotoType(await make())).toBeNull();
  });

  it("goes by the bytes, whatever a file is called", async () => {
    const png = await testImage("png");
    expect(sniffPhotoType(png)).toBe("image/png");
  });
});
