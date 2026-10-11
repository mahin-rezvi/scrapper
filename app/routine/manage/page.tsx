import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import RoutineAutoRefresh from "@/app/routine/RoutineAutoRefresh";
import AdminSignOut from "@/app/routine/manage/AdminSignOut";
import RoutineSyncTrigger from "@/app/routine/manage/RoutineSyncTrigger";
import { routineBoardData, routineManagementData } from "@/lib/db/routines";
import { auth } from "@/lib/auth/server";
import { isRoutineAdmin } from "@/lib/auth/config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function dateTime(value: string | null) {
  if (!value) return "Not run yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value));
}

function displayDate(value: string | Date | null) {
  if (!value) return "Date not listed";
  if (value instanceof Date && Number.isNaN(value.getTime())) return "Date not listed";
  const dateValue = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Date not listed";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function displayTimestamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(date);
}

export default async function RoutineManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const params = await searchParams;
  const { data: session } = await auth.getSession();
  if (!isRoutineAdmin(session?.user.email) || !session?.user.emailVerified) {
    redirect("/auth/sign-in");
  }
  let data: Awaited<ReturnType<typeof routineManagementData>> | null = null;
  try {
    data = await routineManagementData();
  } catch (error) {
    console.error("Routine management data unavailable:", error);
  }
  const selectedDepartment = params.department ?? data?.routines[0]?.departmentCode;
  let board: Awaited<ReturnType<typeof routineBoardData>> | null = null;
  if (selectedDepartment) {
    try {
      board = await routineBoardData(selectedDepartment);
    } catch (error) {
      console.error("Routine timetable unavailable:", error);
    }
  }

  return (
    <main className="product-page management-page">
      <div className="product-wrap">
        <SiteHeader />
        <RoutineAutoRefresh />
        <section className="page-heading">
          <div><span className="eyebrow">Routine operations</span><h1>Routine management</h1><p>Monitor the latest timetable PDFs and publish updates for students.</p></div>
          <div className="admin-page-actions"><Link className="button button-outline" href="/routine">Open routine search <span aria-hidden="true">↗</span></Link><AdminSignOut /></div>
        </section>

        <RoutineSyncTrigger />

        <section className="management-status panel">
          <div className="status-icon">↻</div>
          <div><span className="eyebrow">Automatic scan</span><h2>{data?.lastRun ? `Last check ${data.lastRun.status}` : "Five-minute updates are ready to configure"}</h2><p>{data?.lastRun?.message ?? "The scheduled GitHub Actions workflow checks department boards every five minutes after the required database secrets are added."}</p></div>
          <div className="status-time"><span>Last checked</span><b>{dateTime(data?.lastRun?.finishedAt ?? null)}</b></div>
        </section>

        <section className="managed-routines">
          <div className="results-title"><div><span className="eyebrow">Published schedules</span><h2>Current routines</h2></div><span className="results-count">{data?.routines.length ?? 0} department{data?.routines.length === 1 ? "" : "s"}</span></div>
          {data?.routines.length ? (
            <div className="managed-routine-list">
              {data.routines.map((routine) => (
                <article className="managed-routine-card" key={routine.id}>
                  <div className="department-mark">{routine.departmentCode.toUpperCase().slice(0, 3)}</div>
                  <div className="managed-routine-main"><h3>{routine.departmentName}</h3><p>{routine.title}{routine.versionLabel ? ` · ${routine.versionLabel}` : ""}</p></div>
                  <span className="routine-effective">Effective {routine.effectiveFrom ?? "date unavailable"}</span>
                  {!routine.isCurrent ? <span className="routine-effective">Previous class routine</span> : null}
                  <a className="text-link" href={routine.sourcePdfUrl} target="_blank" rel="noreferrer">PDF <span aria-hidden="true">↗</span></a>
                </article>
              ))}
            </div>
          ) : <div className="empty-panel compact-empty"><h2>No published routines yet</h2><p>Run the first routine update after configuring the Neon database connection. Routine PDF parsing does not require Gemini credentials.</p></div>}
        </section>

        <section className="timetable-section">
          <div className="results-title">
            <div><span className="eyebrow">Full department timetable</span><h2>View a routine</h2><p className="section-results-caption">Choose a department to see its complete imported schedule.</p></div>
          </div>
          {data?.routines.length ? (
            <form action="/routine/manage" method="get" className="routine-manage-filter">
              <label htmlFor="routine-department">Department</label>
              <select id="routine-department" name="department" defaultValue={board?.selectedRoutine?.departmentCode ?? selectedDepartment}>
                {data.routines.map((routine) => <option key={routine.id} value={routine.departmentCode}>{routine.departmentCode.toUpperCase()} · {routine.departmentName}</option>)}
              </select>
              <button className="button button-primary" type="submit">Show routine <span aria-hidden="true">→</span></button>
            </form>
          ) : null}
          {board?.selectedRoutine ? (
            <>
              <div className="timetable-heading management-timetable-heading">
                <div><span className="eyebrow">{board.selectedRoutine.title}</span><h2>{board.selectedRoutine.departmentName}</h2><p>Effective from {displayDate(board.selectedRoutine.effectiveFrom)}{board.selectedRoutine.versionLabel ? ` · ${board.selectedRoutine.versionLabel}` : ""}</p></div>
                <span className={board.selectedRoutine.isCurrent ? "updated-pill" : "updated-pill updated-pill-fallback"}>
                  <span />{board.selectedRoutine.isCurrent ? "Updated" : "Previous class routine"} {displayTimestamp(board.selectedRoutine.parsedAt)}
                </span>
              </div>
              {!board.selectedRoutine.isCurrent ? <p className="routine-fallback-note">The latest imported notice was not a class timetable, so the last recognized class routine is shown.</p> : null}
              {board.days.map((day) => (
                <div className="day-table-wrap" key={day.index}>
                  <div className="day-table-scroll">
                    <table className="routine-table">
                      <thead>
                        <tr className="routine-title-row"><th colSpan={Math.max(day.slots.length * 3, 1)}>{board.selectedRoutine?.title}</th></tr>
                        <tr className="routine-version-row"><th colSpan={Math.max(day.slots.length * 3, 1)}>{board.selectedRoutine?.versionLabel ?? "Class Routine"}</th></tr>
                        <tr className="routine-prepared-row"><th colSpan={Math.max(day.slots.length * 3, 1)}>Effective from {displayDate(board.selectedRoutine?.effectiveFrom ?? null)}{board.selectedRoutine?.preparedBy ? ` · Prepared by ${board.selectedRoutine.preparedBy}` : ""}</th></tr>
                        <tr className="routine-day-row"><th colSpan={Math.max(day.slots.length * 3, 1)}>{day.name}</th></tr>
                        <tr className="routine-slot-row">{day.slots.map((slot) => <th colSpan={3} key={slot.index}>{slot.label}</th>)}</tr>
                        <tr className="routine-columns-row">{day.slots.flatMap((slot) => ["Room", "Course", "Teacher"].map((heading, index) => <th key={`${slot.index}-${index}`}>{heading}</th>))}</tr>
                      </thead>
                      <tbody>
                        {day.rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {row.flatMap((cell, slotIndex) => [cell.room, cell.course, cell.teacher].map((value, columnIndex) => (
                              <td className={columnIndex === 1 ? "course-cell" : ""} key={`${slotIndex}-${columnIndex}`}>{value}</td>
                            )))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {board.selectedRoutine.preparedBy ? <p className="routine-source-note">Prepared by {board.selectedRoutine.preparedBy}. <a href={board.selectedRoutine.sourcePdfUrl} target="_blank" rel="noreferrer">View the source PDF</a>.</p> : null}
            </>
          ) : selectedDepartment ? (
            <div className="empty-panel compact-empty"><h2>Routine unavailable</h2><p>The selected department does not have an imported class timetable.</p></div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
