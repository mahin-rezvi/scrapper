import { NextResponse } from "next/server";
import { syncNotices } from "@/lib/pipeline/syncNotices";
import { syncRoutines } from "@/lib/pipeline/syncRoutines";
import { auth } from "@/lib/auth/server";
import { isRoutineAdmin } from "@/lib/auth/config";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(origin) && new URL(origin!).origin === new URL(request.url).origin;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) {
    return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  }
  const { data: session } = await auth.getSession();
  if (!isRoutineAdmin(session?.user.email) || !session?.user.emailVerified) {
    return NextResponse.json({ error: "Sign in with the authorized admin email to run a sync." }, { status: 401 });
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
