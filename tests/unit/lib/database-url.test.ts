import { afterEach, describe, expect, it, vi } from "vitest";
import { requireDatabaseUrl } from "@/lib/database-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireDatabaseUrl", () => {
  it.each([
    "postgresql://dinner:secret@localhost:5432/dinner_planer",
    "postgres://user@db.example.com/app?sslmode=require",
    "postgresql://user:p%40ss@[::1]:5432/db",
  ])("returns DATABASE_URL %j unchanged", (url) => {
    vi.stubEnv("DATABASE_URL", url);
    expect(requireDatabaseUrl()).toBe(url);
  });

  it("reads the environment on every call, not once at import", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/first");
    expect(requireDatabaseUrl()).toBe("postgresql://localhost/first");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/second");
    expect(requireDatabaseUrl()).toBe("postgresql://localhost/second");
  });

  it.each([
    ["not set", undefined],
    ["empty", ""],
  ])("throws a clear error when DATABASE_URL is %s", (_, value) => {
    vi.stubEnv("DATABASE_URL", value);
    expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL is not set/);
  });

  it("tells the user how to fix a missing DATABASE_URL", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    expect(() => requireDatabaseUrl()).toThrow(/\.env\.example/);
  });
});
