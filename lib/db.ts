import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "./prisma-adapter";

function createPrismaClient(): PrismaClient {
  return new PrismaClient({ adapter: createPgAdapter() });
}

// Next.js discards module state on every hot reload, which would otherwise leak
// a connection pool per edit, so the dev client is cached on globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
