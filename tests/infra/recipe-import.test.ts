import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
}

describe("recipe import: where a pasted link may lead", () => {
  const setting = "RECIPE_IMPORT_ALLOW_PRIVATE";

  it("is switched on for the end-to-end tests only, whose sample site runs on this machine", () => {
    expect(read("playwright.config.ts")).toContain(`${setting}: "1"`);
  });

  it.each([
    "Dockerfile",
    "compose.yaml",
    ...fs.readdirSync(path.join(root, "k8s")).filter((file) => !file.startsWith(".")).map((file) => `k8s/${file}`),
    ".env",
    ".env.example",
    "package.json",
  ])("is not set by %s, so no real deployment can reach private addresses", (file) => {
    if (!fs.existsSync(path.join(root, file))) return;
    expect(read(file)).not.toContain(setting);
  });

  it("is read in one place only", () => {
    const users = ["app", "lib", "components"].flatMap(sourceFiles).filter((file) => read(file).includes(setting));
    expect(users).toEqual(["lib/recipe-import/index.ts"]);
  });

  it("keeps every outgoing request for a pasted address in lib/recipe-import/safe-fetch.ts", () => {
    const sources = ["app", "lib", "components"].flatMap(sourceFiles);
    // The one module that opens connections to somebody else's server.
    const connecting = sources.filter((file) => /from "node:(https?|net|tls|dns)"|require\("(https?|net|tls)"\)/.test(read(file)));
    expect(connecting.sort()).toEqual(["lib/recipe-import/address.ts", "lib/recipe-import/safe-fetch.ts"]);
    // And no other server code calls fetch(): the browser's own calls are the dialog's, to this app.
    const fetching = sources.filter((file) => /\bfetch\(/.test(read(file)));
    expect(fetching).toEqual(["components/import-recipe-dialog.tsx"]);
  });

  it("is only ever asked through the functions that check the address", () => {
    const sources = ["app", "lib", "components"].flatMap(sourceFiles);
    const callersOf = (name: string) => sources.filter((file) => read(file).includes(`${name}(`)).sort();
    expect(callersOf("fetchPage")).toEqual(["lib/recipe-import/index.ts", "lib/recipe-import/safe-fetch.ts"]);
    expect(callersOf("fetchImage")).toEqual(["lib/recipe-import/index.ts", "lib/recipe-import/safe-fetch.ts"]);
    // The routes go through the two entry points, which in turn go through the fetcher.
    expect(callersOf("importRecipe")).toEqual(["app/recipes/import/route.ts", "app/recipes/new/page.tsx", "lib/recipe-import/index.ts"]);
    expect(callersOf("importPhoto")).toEqual(["app/recipes/import/photo/route.ts", "lib/recipe-import/index.ts"]);
  });

  it("serves no downloaded picture as it came: only a JPEG, PNG or WebP by its bytes, with nosniff", () => {
    const route = read("app/recipes/import/photo/route.ts");
    expect(route).toContain('"x-content-type-options": "nosniff"');
    expect(read("lib/recipe-import/index.ts")).toContain("sniffPhotoType");
  });
});
