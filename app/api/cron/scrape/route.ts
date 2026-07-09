import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline/runPipeline";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/cron/scrape
 * Triggered by Vercel Cron or GitHub Actions on a schedule.
 * No auth — endpoint is public, keep this in mind if abuse becomes a concern later.
 */
export async function GET() {
  logger.info("[cron/scrape] Starting pipeline");
  try {
    const results = await runPipeline();
    const totalNew = results.reduce((s, r) => s + r.newCount, 0);
    const totalErrors = results.reduce((s, r) => s + r.errorCount, 0);

    return NextResponse.json({
      ok: true,
      totalNew,
      totalErrors,
      departments: results,
    });
  } catch (err) {
    logger.error(`[cron/scrape] Pipeline threw: ${err}`);
    return NextResponse.json(
      { error: "Pipeline failed", detail: String(err) },
      { status: 500 }
    );
  }
}

// Allow POST too, in case any trigger prefers it
export { GET as POST };