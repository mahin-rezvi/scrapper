import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

// pg v8 treats sslmode=prefer|require|verify-ca as verify-full aliases and
// warns about the upcoming libpq semantic change. Use verify-full explicitly.
function normalizePgConnectionString(url: string): string {
  return url.replace(
    /([?&])sslmode=(prefer|require|verify-ca)(?=(&|$))/i,
    "$1sslmode=verify-full"
  );
}

// Standard Next.js singleton pattern — prevents connection exhaustion
// during hot-reload in development (globalThis persists across module reloads).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    config({ path: ".env", quiet: true });
    config({ path: ".env.local", override: true, quiet: true });
  }

  const rawUrl = process.env.DATABASE_URL;

  if (!rawUrl) {
    throw new Error("DATABASE_URL is required to initialize Prisma.");
  }

  const connectionString = normalizePgConnectionString(rawUrl);
  const adapter = new PrismaPg({ connectionString });

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
