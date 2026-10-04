import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLACEHOLDER, ensureEnv } from "../../scripts/env-lib";

const EXAMPLE = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf-8");
const PASSWORD = "0123456789abcdef";
const generate = () => PASSWORD;

describe("ensureEnv", () => {
  it("creates .env from the example with a random password in both lines", () => {
    const { text, note } = ensureEnv(undefined, EXAMPLE, generate);

    expect(text).toContain(`POSTGRES_PASSWORD="${PASSWORD}"`);
    expect(text).toContain(`postgresql://dinner:${PASSWORD}@localhost:5433/dinner_planner`);
    expect(text).not.toContain(PLACEHOLDER + '"');
    expect(note).toContain("Created .env");
  });

  it("generates a different password each time and one that is safe in a URL", () => {
    const first = /^POSTGRES_PASSWORD="(.+)"$/m.exec(ensureEnv(undefined, EXAMPLE).text)![1];
    const second = /^POSTGRES_PASSWORD="(.+)"$/m.exec(ensureEnv(undefined, EXAMPLE).text)![1];

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f]{48}$/);
  });

  it("leaves a .env that already has a password alone", () => {
    const current = 'POSTGRES_PASSWORD="mine"\nDATABASE_URL="postgresql://dinner:mine@localhost:5433/x"\n';

    expect(ensureEnv(current, EXAMPLE, generate)).toEqual({ text: current });
  });

  it("keeps the password of an older .env, because its database volume was created with it", () => {
    const current = 'DATABASE_URL="postgresql://dinner:old%20pw@localhost:5433/dinner_planner?schema=public"\n';

    const { text, note } = ensureEnv(current, EXAMPLE, generate);

    expect(text).toBe(`${current}POSTGRES_PASSWORD="old pw"\n`);
    expect(note).toContain("the existing database keeps it");
  });

  it("keeps other settings and adds a random password to a .env that has no database URL", () => {
    const { text } = ensureEnv("SOMETHING=1", EXAMPLE, generate);

    expect(text).toBe(
      `SOMETHING=1\nPOSTGRES_PASSWORD="${PASSWORD}"\nDATABASE_URL="postgresql://dinner:${PASSWORD}@localhost:5433/dinner_planner?schema=public"\n`,
    );
  });

  it("treats a DATABASE_URL without a password as having none", () => {
    const { text } = ensureEnv('DATABASE_URL="postgresql://dinner@localhost:5433/x"\n', EXAMPLE, generate);

    expect(text).toContain(`POSTGRES_PASSWORD="${PASSWORD}"`);
    expect(text.match(/^DATABASE_URL=/gm)).toHaveLength(1);
    expect(text).toContain(`dinner:${PASSWORD}@`);
  });
});
