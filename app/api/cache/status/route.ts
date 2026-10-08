import { NextResponse } from "next/server";
import { getCacheStatus } from "@/lib/cache";

/**
 * GET /api/cache/status
 * Returns current cache statistics and performance metrics
 */
export async function GET() {
  const status = getCacheStatus();

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

/**
 * DELETE /api/cache/status
 * Clears all cache entries (useful for forced refresh)
 */
export async function DELETE() {
  const { cache } = await import("@/lib/cache");
  const statsBefore = cache.getStats();

  cache.clear();

  return NextResponse.json({
    message: "Cache cleared",
    statsBefore,
    statsAfter: cache.getStats(),
  });
}
