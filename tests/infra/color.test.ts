import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor } from "@/tests/support/color";

// The focus ring tests (tests/e2e/buttons.spec.ts) rest on these two functions: a wrong luminance
// formula or a colour read the wrong way would make a 3:1 check pass or fail for no reason.
describe("parseColor", () => {
  it("reads rgb() and rgba() in every notation a browser returns", () => {
    expect(parseColor("rgb(42, 33, 24)")).toEqual({ r: 42, g: 33, b: 24, a: 1 });
    expect(parseColor("rgba(255, 253, 248, 0.5)")).toEqual({ r: 255, g: 253, b: 248, a: 0.5 });
    expect(parseColor("rgb(0 0 0 / 0.25)")).toEqual({ r: 0, g: 0, b: 0, a: 0.25 });
    expect(parseColor("rgb(0 0 0 / 50%)").a).toBe(0.5);
    expect(parseColor("rgba(0, 0, 0, 0)").a).toBe(0);
  });

  it("throws on any other notation, so a change of format is noticed and not read as black", () => {
    expect(() => parseColor("color(srgb 0.1 0.2 0.3)")).toThrow(/Not an rgb colour/);
    expect(() => parseColor("oklch(0.5 0.1 30)")).toThrow();
    expect(() => parseColor("transparent")).toThrow();
    expect(() => parseColor("#2a2118")).toThrow();
  });
});

describe("contrastRatio", () => {
  const black = parseColor("rgb(0, 0, 0)");
  const white = parseColor("rgb(255, 255, 255)");

  it("is 21 for black on white and 1 for a colour on itself, whichever way round", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBe(1);
  });

  it("matches the published value for #767676 on white (4.54:1, the lightest grey that passes AA)", () => {
    expect(contrastRatio(parseColor("rgb(118, 118, 118)"), white)).toBeCloseTo(4.54, 2);
  });

  it("sits where the app's own colours do: the text colour is far above 3:1 on both surfaces", () => {
    const text = parseColor("rgb(42, 33, 24)"); // --foreground
    expect(contrastRatio(text, parseColor("rgb(255, 253, 248)"))).toBeGreaterThan(14); // --surface
    expect(contrastRatio(text, parseColor("rgb(246, 241, 231)"))).toBeGreaterThan(12); // --background
  });
});
