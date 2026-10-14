import { prisma } from "@/lib/db";

// Never cached: the point is to report what is true right now.
export const dynamic = "force-dynamic";

/**
 * Readiness probe for Kubernetes.
 *
 * Open to everyone (the Kubernetes probes carry no cookie, see proxy.ts), so it says only "ok" or "database-unreachable".
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
    // The reason goes to the log, not to the answer: this path is open to anyone who can reach the app, and a database
    // error can name its host, port and user. The probes only need the status.
    console.error("healthz: the database is unreachable:", error instanceof Error ? error.message : error);
    return Response.json({ status: "database-unreachable" }, { status: 503 });
  }
}
