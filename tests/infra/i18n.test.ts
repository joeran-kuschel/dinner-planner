import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parsePoFile } from "@lingui/format-po";
import { afterAll, describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/config";

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
});
