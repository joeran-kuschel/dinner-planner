import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

function read(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("local Postgres for development and tests", () => {
  it(".env.example connects to the database, user and host port that compose.yaml creates", () => {
    const db = parse(read("compose.yaml")).services.db;
    const url = new URL(/^DATABASE_URL="(.+)"$/m.exec(read(".env.example"))![1]);

    expect(url.pathname).toBe(`/${db.environment.POSTGRES_DB}`);
    expect(url.username).toBe(db.environment.POSTGRES_USER);
    expect(url.password).toBe(db.environment.POSTGRES_PASSWORD);
    expect(db.ports).toContain(`${url.port}:5432`);
    expect(db.healthcheck.test.join(" ")).toContain(`-d ${db.environment.POSTGRES_DB}`);
  });
});
