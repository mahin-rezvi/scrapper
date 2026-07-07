import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline/runPipeline";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/cron/scrape
 * Triggered by Vercel Cron or GitHub Actions.
 * Requires: Authorization: Bearer {CRON_SECRET}
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("[cron/scrape] CRON_SECRET is not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (token !== cronSecret) {
    logger.warn("[cron/scrape] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[cron/scrape] Authorized — starting pipeline");

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

// Allow POST for manual triggering
export { GET as POST };
