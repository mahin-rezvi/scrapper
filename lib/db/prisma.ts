import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

// Standard Next.js singleton pattern — prevents connection exhaustion
// during hot-reload in development (globalThis persists across module reloads).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  if (!process.env.NEON_DATABASE_URL && !process.env.DATABASE_URL) {
    config({ path: ".env", quiet: true });
    config({ path: ".env.local", override: true, quiet: true });
  }

  const rawUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

  if (!rawUrl) {
    throw new Error("NEON_DATABASE_URL is required to initialize Prisma.");
  }

  const adapter = new PrismaNeon({ connectionString: rawUrl });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
