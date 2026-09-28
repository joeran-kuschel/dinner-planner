import { prisma } from "@/lib/db";

// Never cached: the point is to report what is true right now.
export const dynamic = "force-dynamic";

/**
 * Readiness probe for Kubernetes.
 *
 * Reports 503 while the database cannot be reached, which keeps the pod out of
 * the Service until migrations have finished and Postgres is accepting
 * connections. Liveness uses a plain TCP check instead — a database outage
 * should not restart the web process.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch (error) {
    return Response.json(
      { status: "database-unreachable", detail: error instanceof Error ? error.message : null },
      { status: 503 },
    );
  }
}
