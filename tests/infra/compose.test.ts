import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { PLACEHOLDER } from "../../scripts/env-lib";

function read(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("local Postgres for development and tests", () => {
  it(".env.example connects to the database, user and host port that compose.yaml creates", () => {
    const db = parse(read("compose.yaml")).services.db;
    const url = new URL(/^DATABASE_URL="(.+)"$/m.exec(read(".env.example"))![1]);

    expect(url.pathname).toBe(`/${db.environment.POSTGRES_DB}`);
    expect(url.username).toBe(db.environment.POSTGRES_USER);
    expect(db.ports).toContain(`${url.port}:5432`);
    expect(db.healthcheck.test.join(" ")).toContain(`-d ${db.environment.POSTGRES_DB}`);
  });

  it("takes the password from .env and has none of its own, and .env.example uses one placeholder for both lines", () => {
    const db = parse(read("compose.yaml")).services.db;
    expect(db.environment.POSTGRES_PASSWORD).toMatch(/^\$\{POSTGRES_PASSWORD:\?.+\}$/);

    const example = read(".env.example");
    const url = new URL(/^DATABASE_URL="(.+)"$/m.exec(example)![1]);
    expect(/^POSTGRES_PASSWORD="(.+)"$/m.exec(example)![1]).toBe(url.password);
    expect(url.password).toBe(PLACEHOLDER);
  });

  it("runs `npm run db:up` through the script that creates .env, and .env stays out of git", () => {
    const scripts: Record<string, string> = JSON.parse(read("package.json")).scripts;
    expect(scripts["db:up"]).toMatch(/^tsx scripts\/ensure-env\.ts && docker compose up /);
    expect(read(".gitignore")).toMatch(/^\.env\*$/m);
    expect(read(".gitignore")).toMatch(/^!\.env\.example$/m);
  });
});
