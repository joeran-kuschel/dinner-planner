import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { I18n } from "@lingui/core";
import { plural, t } from "@lingui/core/macro";
import { parsePoFile } from "@lingui/format-po";
import { afterAll, describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/config";
import { testI18n } from "@/tests/support/i18n";

const root = path.resolve(__dirname, "../..");
const catalog = (locale: string) => readFileSync(path.join(root, "locales", locale, "messages.po"), "utf8");

/** The ICU arguments a message uses: "{name}", "{count, plural, …}" → name, count. */
function placeholders(message: string): string {
  return [...new Set([...message.matchAll(/\{(\w+)[,}]/g)].map((match) => match[1]))].sort().join();
}

describe("translation catalogs", () => {
  it("has a catalog for every language the app offers", () => {
    for (const locale of LOCALES) {
      expect(parsePoFile(catalog(locale)).headers.Language).toBe(locale);
    }
  });

  it("translates every message into German", () => {
    const untranslated = parsePoFile(catalog("de"))
      .items.filter((item) => !item.obsolete && !item.msgstr.join("").trim())
      .map((item) => item.msgid);
    expect(untranslated).toEqual([]);
  });

  it("keeps every placeholder of the English message in the German one", () => {
    // A German plural where English needs none ("Serves {servings}") may use
    // its argument more than once, but must use the same ones.
    const mismatched = parsePoFile(catalog("de"))
      .items.filter((item) => placeholders(item.msgid) !== placeholders(item.msgstr.join("")))
      .map((item) => item.msgid);
    expect(mismatched).toEqual([]);
  });

  it("has no obsolete entries left over", () => {
    for (const locale of LOCALES) {
      expect(parsePoFile(catalog(locale)).items.filter((item) => item.obsolete).map((item) => item.msgid)).toEqual([]);
    }
  });

  describe("up to date with the source", () => {
    // Extract again into a copy of the catalogs; any difference means a
    // message was added, changed or removed without `npm run i18n:extract`.
    const work = mkdtempSync(path.join(tmpdir(), "i18n-check-"));
    // Inside the project, so the config can import Lingui from node_modules.
    const configDir = path.join(root, "node_modules", ".cache", path.basename(work));
    afterAll(() => {
      rmSync(work, { recursive: true, force: true });
      rmSync(configDir, { recursive: true, force: true });
    });

    it("matches what `npm run i18n:extract` would write", () => {
      cpSync(path.join(root, "locales"), path.join(work, "locales"), { recursive: true });
      mkdirSync(configDir, { recursive: true });
      const config = path.join(configDir, "lingui.config.ts");
      writeFileSync(
        config,
        `import base from ${JSON.stringify(path.join(root, "lingui.config.ts"))};
export default {
  ...base,
  rootDir: ${JSON.stringify(root)},
  catalogs: base.catalogs!.map((c) => ({
    ...c,
    path: ${JSON.stringify(path.join(work, "locales", "{locale}", "messages"))},
    include: c.include.map((dir: string) => ${JSON.stringify(root + "/")} + dir),
  })),
};
`,
      );

      execFileSync("npx", ["lingui", "extract", "--clean", "--workers", "1", "--config", config], {
        cwd: root,
        stdio: "pipe",
      });

      for (const locale of LOCALES) {
        const fresh = readFileSync(path.join(work, "locales", locale, "messages.po"), "utf8");
        expect(fresh, `locales/${locale}/messages.po is stale: run npm run i18n:extract`).toBe(catalog(locale));
      }
    });
  });

  describe("counts in the server pages", () => {
    // The same source messages as the pages, so the macros resolve to the same
    // catalog entries. German needs a plural where English does not ("Serves").
    const messages: Record<string, (i18n: I18n, n: number) => string> = {
      "recipe list count": (i18n, recipeCount) =>
        t(i18n)`${plural(recipeCount, { one: "# recipe", other: "# recipes" })} to plan from`,
      "recipe card servings": (i18n, servings) => t(i18n)`Serves ${servings}`,
      "recipe card ingredients": (i18n, ingredients) =>
        t(i18n)`${plural(ingredients, { one: "# ingredient", other: "# ingredients" })}`,
      "recipe card planned days": (i18n, plannedFor) => t(i18n)`planned ${plannedFor}×`,
      "grocery list sources": (i18n, recipeCount) =>
        t(i18n)`from ${plural(recipeCount, { one: "# recipe", other: "# recipes" })}`,
      "grocery list typed dinners": (i18n, typedCount) =>
        t(i18n)`${plural(typedCount, {
          one: "# dinner without a recipe adds nothing",
          other: "# dinners without a recipe add nothing",
        })}`,
    };

    it.each([
      ["recipe list count", 1, "1 recipe to plan from", "1 Rezept zur Auswahl"],
      ["recipe list count", 2, "2 recipes to plan from", "2 Rezepte zur Auswahl"],
      ["recipe list count", 0, "0 recipes to plan from", "0 Rezepte zur Auswahl"],
      ["recipe card servings", 1, "Serves 1", "Für 1 Person"],
      ["recipe card servings", 4, "Serves 4", "Für 4 Personen"],
      ["recipe card ingredients", 1, "1 ingredient", "1 Zutat"],
      ["recipe card ingredients", 3, "3 ingredients", "3 Zutaten"],
      ["recipe card planned days", 2, "planned 2×", "2× geplant"],
      ["grocery list sources", 1, "from 1 recipe", "aus 1 Rezept"],
      ["grocery list sources", 2, "from 2 recipes", "aus 2 Rezepten"],
      ["grocery list typed dinners", 1, "1 dinner without a recipe adds nothing", "1 Abendessen ohne Rezept steuert nichts bei"],
      ["grocery list typed dinners", 2, "2 dinners without a recipe add nothing", "2 Abendessen ohne Rezept steuern nichts bei"],
    ])("%s for %i reads %j in English and %j in German", (key, count, english, german) => {
      expect(messages[key](testI18n("en"), count)).toBe(english);
      expect(messages[key](testI18n("de"), count)).toBe(german);
    });
  });
});
