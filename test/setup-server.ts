import { randomBytes } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { afterAll, beforeEach, vi } from "vitest";
import { createMigratedSchema, dropSchema, urlForSchema } from "./migrate";

loadEnv({ quiet: true });

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Start the local database with `npm run db:up` and copy .env.example to .env.",
  );
}

// Every test file gets its own schema in the development database, so files
// never see each other's rows and the `public` schema is left alone. This runs
// before the test file imports `lib/db.ts`, which reads DATABASE_URL when it
// creates the client.
const schema = `test_${randomBytes(6).toString("hex")}`;
await createMigratedSchema(baseUrl, schema);
process.env.DATABASE_URL = urlForSchema(baseUrl, schema);

// `lib/db.ts` caches its client on globalThis outside production, and a vitest
// worker reuses globalThis across the test files it runs. Without clearing it,
// the second file in a worker would silently keep the first file's connection
// — and therefore the first file's schema.
clearCachedPrismaClient();

// Server actions call these. revalidatePath needs a running Next.js server, and
// redirect works by throwing; the mock throws a recognizable error instead, so
// tests can assert the target with `expectRedirect` from test/next.ts.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", async () => {
  const { RedirectError } = await import("./next");
  return {
    redirect: vi.fn((url: string) => {
      throw new RedirectError(url);
    }),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  };
});

beforeEach(async () => {
  const { resetDatabase } = await import("./db");
  await resetDatabase();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/db");
  await prisma.$disconnect();
  clearCachedPrismaClient();
  await dropSchema(baseUrl, schema);
});

function clearCachedPrismaClient(): void {
  delete (globalThis as { prisma?: unknown }).prisma;
}
