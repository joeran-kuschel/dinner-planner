import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { dynamic, GET } from "@/app/healthz/route";

describe("GET /healthz", () => {
  it("answers 200 while the database is reachable", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("answers 503 while the database is unreachable, and keeps the reason to itself: anyone can ask", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("5432");
    expect(log).toHaveBeenCalledWith("healthz: the database is unreachable:", "connect ECONNREFUSED 127.0.0.1:5432");
  });

  it("answers 503 with the same body when the failure is not an Error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue("down");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "database-unreachable" });
  });

  it("is never cached, so the probe sees the current state", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
