import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCESS_COOKIE, nowSeconds, signSession } from "@/lib/access";
import { accessRefusal, requireAccess } from "@/lib/access-guard";

const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined, reads: 0 }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      cookieJar.reads++;
      return name === "dp_access" && cookieJar.value ? { name, value: cookieJar.value } : undefined;
    },
  }),
}));

const KEY = "g".repeat(43);

beforeEach(() => {
  cookieJar.value = undefined;
  cookieJar.reads = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("accessRefusal and requireAccess", () => {
  it("let everything through where there is no gate (dev, tests), without looking at a cookie", async () => {
    expect(await accessRefusal()).toBeNull();
    await expect(requireAccess()).resolves.toBeUndefined();
    expect(cookieJar.reads).toBe(0);
  });

  it("refuse with 503 in production without a key", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const refusal = await accessRefusal();

    expect(refusal?.status).toBe(503);
    expect(await refusal?.json()).toEqual({ error: "access-key-not-configured" });
    await expect(requireAccess()).rejects.toThrow("Access refused (503)");
  });

  it("refuse with 401 without the cookie, or with a bad one", async () => {
    vi.stubEnv("ACCESS_KEY", KEY);

    expect((await accessRefusal())?.status).toBe(401);
    cookieJar.value = "v1.1.abc";
    expect((await accessRefusal())?.status).toBe(401);
    cookieJar.value = signSession("another-key-0123456789abcdef", nowSeconds());
    await expect(requireAccess()).rejects.toThrow("Access refused (401)");
  });

  it("let a valid cookie through", async () => {
    vi.stubEnv("ACCESS_KEY", KEY);
    cookieJar.value = signSession(KEY, nowSeconds());

    expect(await accessRefusal()).toBeNull();
    await expect(requireAccess()).resolves.toBeUndefined();
    expect(ACCESS_COOKIE).toBe("dp_access");
  });
});
