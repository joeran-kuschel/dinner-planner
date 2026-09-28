import { expect } from "vitest";
import { configureAxe } from "vitest-axe";

// jsdom has no canvas and no layout, so the contrast rule can only report
// "incomplete" (and logs a canvas warning). Contrast is checked in a browser.
const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

/**
 * Fail with the list of axe violations, if any. Not a contrast check: see above.
 */
export async function expectNoAxeViolations(element: Element): Promise<void> {
  const results = await axe(element);
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
