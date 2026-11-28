import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execSync, cpSync } = vi.hoisted(() => ({ execSync: vi.fn(), cpSync: vi.fn() }));
vi.mock("node:child_process", () => ({ execSync, spawn: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, cpSync, default: { ...actual, cpSync } };
});

import globalSetup from "@/tests/e2e/support/global-setup";
import { MAX_DEFAULT_WORKERS, e2eWorkers } from "@/tests/e2e/support/workers";
import net from "node:net";
import { assertPortFree } from "@/tests/e2e/support/server";

describe("Playwright's global setup", () => {
  beforeEach(() => {
    execSync.mockReset();
    cpSync.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("builds the app when started alone, then lays out the standalone server like the Docker image", () => {
    vi.stubEnv("E2E_PREBUILT", "");
    globalSetup();
    expect(execSync).toHaveBeenCalledWith("npm run build", expect.anything());
    expect(execSync.mock.invocationCallOrder[0]).toBeLessThan(cpSync.mock.invocationCallOrder[0]);
    expect(cpSync).toHaveBeenCalledWith("public", ".next/standalone/public", { recursive: true });
    expect(cpSync).toHaveBeenCalledWith(".next/static", ".next/standalone/.next/static", { recursive: true });
  });

  it.each(["0", "false", ""])("builds its own app when the flag is %j: only 1 means a build was made", (value) => {
    vi.stubEnv("E2E_PREBUILT", value);
    globalSetup();
    expect(execSync).toHaveBeenCalledTimes(1);
  });

  it("starts from the build of the check when told, and still lays out the standalone server", () => {
    vi.stubEnv("E2E_PREBUILT", "1");
    globalSetup();
    expect(execSync).not.toHaveBeenCalled();
    expect(cpSync).toHaveBeenCalledTimes(2);
  });
});

describe("how many workers Playwright runs", () => {
  it("takes E2E_WORKERS when it is a whole number of 1 or more", () => {
    expect(e2eWorkers({ E2E_WORKERS: "3" }, 64)).toBe(3);
    expect(e2eWorkers({ E2E_WORKERS: "12" }, 2)).toBe(12);
  });

  it.each(["0", "-1", "two", "1.5", " 2"])("refuses E2E_WORKERS=%j instead of guessing", (value) => {
    expect(() => e2eWorkers({ E2E_WORKERS: value }, 8)).toThrow(/E2E_WORKERS/);
  });

  it("uses a third of the cores when it is not set, at least 1 and at most the default maximum", () => {
    expect(e2eWorkers({}, 1)).toBe(1);
    expect(e2eWorkers({}, 4)).toBe(1);
    expect(e2eWorkers({}, 9)).toBe(3);
    expect(e2eWorkers({}, 64)).toBe(MAX_DEFAULT_WORKERS);
    expect(e2eWorkers({ E2E_WORKERS: "" }, 12)).toBe(4);
  });
});

describe("the check that a worker's port is free", () => {
  const listeners: net.Server[] = [];
  afterEach(async () => {
    await Promise.all(listeners.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  });
  const listen = (host: string) =>
    new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      listeners.push(server);
      server.once("error", reject);
      server.listen(0, host, () => resolve((server.address() as net.AddressInfo).port));
    });

  it("passes for a port nothing listens on", async () => {
    const port = await listen("127.0.0.1");
    await new Promise((resolve) => listeners.pop()!.close(resolve));
    await expect(assertPortFree(port)).resolves.toBeUndefined();
  });

  it("refuses a port a server listens on at 127.0.0.1, and says how to find it", async () => {
    await expect(assertPortFree(await listen("127.0.0.1"))).rejects.toThrow(/in use[\s\S]*lsof -i :\d+/);
  });

  it("refuses a port a server listens on at ::1 too, which `localhost` can mean", async (context) => {
    let port: number;
    try {
      port = await listen("::1");
    } catch {
      context.skip(); // a machine without IPv6
      return;
    }
    await expect(assertPortFree(port)).rejects.toThrow(/in use/);
  });
});
