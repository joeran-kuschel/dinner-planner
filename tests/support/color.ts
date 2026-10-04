/** Colour maths for the tests: computed CSS colours and the WCAG contrast ratio. No browser needed. */

export type Rgb = { r: number; g: number; b: number; a: number };

/** Parse a computed `rgb()` / `rgba()` colour; throws on any other notation, so a change of format is noticed. */
export function parseColor(css: string): Rgb {
  const match = css.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!match) throw new Error(`Not an rgb colour: ${css}`);
  const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: alpha };
}

const luminance = ({ r, g, b }: Rgb) => {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

/** The WCAG contrast ratio of two opaque colours, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
