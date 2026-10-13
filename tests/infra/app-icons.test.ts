import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The ICO and the Apple icon are rendered from app/icon.svg; see documentation/ui/design.md.

const file = (name: string) => readFileSync(join(process.cwd(), "app", name));

describe("the rendered icons", () => {
  it("favicon.ico holds 16, 32 and 48 px images", () => {
    const ico = file("favicon.ico");
    expect(ico.readUInt16LE(2)).toBe(1); // an icon, not a cursor
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + 16 * i]);
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("apple-icon.png is a 180 px PNG", () => {
    const png = file("apple-icon.png");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
  });
});
