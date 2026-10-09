import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncNotices } from "@/lib/pipeline/syncNotices";
import { syncRoutines } from "@/lib/pipeline/syncRoutines";

export const runtime = "nodejs";
export const maxDuration = 300;

function matchesSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const expected = process.env.ROUTINE_SYNC_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Manual routine sync is not configured." }, { status: 503 });
  }
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matchesSecret(provided, expected)) {
    return NextResponse.json({ error: "Invalid management key." }, { status: 401 });
  }

  try {
    const notices = await syncNotices();
    const failedNoticeDepartments = new Set(
      notices.departments
        .filter((department) => department.errors > 0)
        .map((department) => department.department),
    );
    const routines = await syncRoutines({ skipDepartmentCodes: failedNoticeDepartments });
    const status = notices.status === "partial" || routines.status === "partial"
      ? "partial"
      : "completed";
    return NextResponse.json({
      ...routines,
      status,
      message: `Notice scan: ${notices.noticesAdded} added, ${notices.noticesRefreshed} refreshed, ${notices.errors} errors. ${routines.message}`,
    });
  } catch (error) {
    console.error("Routine sync failed:", error);
    return NextResponse.json({ error: "Routine sync failed. Check the server logs." }, { status: 500 });
  }
}
