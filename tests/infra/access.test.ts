import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf-8");
const codeOf = (file: string) =>
  read(file).split("\n").filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("#")).join("\n");

/** The exported async functions of a file, each with the code up to the next one. */
function exportedFunctions(file: string): { name: string; body: string }[] {
  const text = codeOf(file);
  const starts = [...text.matchAll(/export async function (\w+)\(/g)];
  return starts.map((match, index) => ({
    name: match[1],
    body: text.slice(match.index, starts[index + 1]?.index ?? text.length),
  }));
}

/** The first statement of a function's body. */
const firstStatement = (body: string) => body.slice(body.indexOf("{\n") + 2).trimStart().split("\n")[0].trim();

describe("the access gate covers the whole app", () => {
  const actionFiles = fs.readdirSync("app/actions").filter((file) => file.endsWith(".ts")).map((file) => `app/actions/${file}`);

  it.each(actionFiles)("%s: every server action checks the access cookie before anything else", (file) => {
    const functions = exportedFunctions(file);
    expect(functions.length, file).toBeGreaterThan(0);
    for (const { name, body } of functions) {
      expect(firstStatement(body), `${file} ${name}`).toBe("await requireAccess();");
    }
  });

  /** Every route.ts under app/, except the two the gate leaves open. */
  const routeFiles = execFileSync("git", ["ls-files", "app"], { encoding: "utf-8" })
    .split("\n")
    .filter((file) => file.endsWith("/route.ts") && !["app/healthz/route.ts", "app/access/route.ts"].includes(file));

  it("has route handlers to check", () => {
    expect(routeFiles).toEqual(["app/recipes/[id]/photo/route.ts", "app/recipes/import/photo/route.ts", "app/recipes/import/route.ts"]);
  });

  it.each(routeFiles)("%s: the handler asks for access first", (file) => {
    for (const { name, body } of exportedFunctions(file).filter(({ name }) => ["GET", "POST"].includes(name))) {
      const inner = body.slice(body.indexOf("{\n") + 2);
      expect(inner.indexOf("accessRefusal()"), `${file} ${name}`).toBeGreaterThanOrEqual(0);
      // Nothing that reads the request or the database comes before it.
      expect(inner.slice(0, inner.indexOf("const refusal")), `${file} ${name}`).not.toMatch(/await |prisma|request\./);
      expect(inner, `${file} ${name}`).toMatch(/^\s*const refusal = await accessRefusal\(\);\n\s*if \(refusal\) return refusal;/);
    }
  });

  it("proxy.ts leaves exactly /healthz and /access open", () => {
    expect(read("proxy.ts")).toMatch(/new Set\(\["\/healthz", "\/access"\]\)/);
  });

  it("a pod without a usable key refuses everything: the image runs in production, so a missing key is not 'off'", () => {
    expect(read("Dockerfile")).toMatch(/ENV NODE_ENV=production/);
    expect(read("lib/access.ts")).toContain('env.NODE_ENV === "production" ? { mode: "unconfigured" }');
  });
});

describe("the access key stays out of the repository", () => {
  it("is in no manifest, no example file, no script and no doc: only the Secret's name is", () => {
    const files = [...fs.readdirSync("k8s").map((file) => `k8s/${file}`), ".env.example", "compose.yaml", "README.md", "package.json"];

    for (const file of files) {
      // Comments may show a placeholder; a line that sets a key is what must not be there.
      const text = read(file).split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
      expect(text, file).not.toMatch(/^\s*ACCESS_KEY:\s*"?(?!\$)[\w-]{16,}/m);
      expect(text, file).not.toMatch(/ACCESS_KEY=["']?[\w-]{16,}/);
    }
  });

  it("the test server's key is in playwright.config.ts alone", () => {
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf-8" }).split("\n").filter(Boolean);
    const withKey = tracked.filter((file) => fs.existsSync(file) && fs.statSync(file).isFile() && /\.(ts|tsx|md|yaml|sh|json)$/.test(file) && read(file).includes("e2e-access-key-0123456789abcdef"));

    expect(withKey).toEqual(["playwright.config.ts"]);
  });

  it("the app container reads the key from the Secret that deploy.sh makes, the migrator does not", () => {
    const name = /^ACCESS_SECRET=(\S+)$/m.exec(read("k8s/access-secret.sh"))![1];
    const app = read("k8s/app.yaml");

    expect(app.split("name: " + name).length - 1).toBe(1);
    expect(app.indexOf(`name: ${name}`)).toBeGreaterThan(app.indexOf("- name: app"));
    expect(read("k8s/seed-job.yaml")).not.toContain(name);
  });

  it("makes and replaces the Secret with `create` / `replace`, never `apply`, which would copy the key into an annotation", () => {
    for (const file of ["k8s/access-secret.sh", "k8s/access-link.sh", "k8s/rotate-access-key.sh"]) {
      expect(codeOf(file), file).not.toMatch(/\bapply\b/);
    }
    expect(codeOf("k8s/deploy.sh")).toContain("access_secret_manifest");
    expect(codeOf("k8s/rotate-access-key.sh")).toContain("replace -f -");
  });
});
