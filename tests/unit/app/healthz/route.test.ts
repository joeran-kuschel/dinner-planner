import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { dynamic, GET } from "@/app/healthz/route";

describe("GET /healthz", () => {
  it("answers 200 while the database is reachable", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("answers 503 with the reason while the database is unreachable", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "database-unreachable",
      detail: "connect ECONNREFUSED 127.0.0.1:5432",
    });
  });

  it("reports no detail when the failure is not an Error", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue("down");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "database-unreachable", detail: null });
  });

  it("is never cached, so the probe sees the current state", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
