import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [totalNotices, processedNotices, failedNotices, departments, lastRun] =
      await Promise.all([
        prisma.notification.count(),
        prisma.notification.count({ where: { status: "processed" } }),
        prisma.notification.count({ where: { status: "failed" } }),
        prisma.department.count(),
        prisma.runLog.findFirst({ orderBy: { startedAt: "desc" } }),
      ]);

    return NextResponse.json({
      ok: true,
      totals: {
        notices: totalNotices,
        processed: processedNotices,
        failed: failedNotices,
        departments,
      },
      lastRun,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Failed to load pipeline status", detail: String(err) },
      { status: 500 }
    );
  }
}
