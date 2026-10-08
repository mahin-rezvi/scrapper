import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { routineBoardData } from "@/lib/db/routines";

export const dynamic = "force-dynamic";

function displayDate(value: string | null) {
  if (!value) return "Date not listed";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export default async function RoutinePage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; section?: string }>;
}) {
  const params = await searchParams;
  let board: Awaited<ReturnType<typeof routineBoardData>> | null = null;
  let error = false;
  try {
    board = await routineBoardData(params.department, params.section);
  } catch (cause) {
    console.error("Routine page data unavailable:", cause);
    error = true;
  }

  return (
    <main className="product-page routine-page">
      <div className="product-wrap">
        <SiteHeader />
        <section className="page-heading routine-heading">
          <div>
            <span className="eyebrow">Plan your week</span>
            <h1>Class routine</h1>
            <p>Find your section in the latest official timetable.</p>
          </div>
          {board?.selectedRoutine ? (
            <a className="button button-outline" href={board.selectedRoutine.sourcePdfUrl} target="_blank" rel="noreferrer">
              Open original PDF <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </section>

        <section className="routine-search panel" aria-label="Search routine by section">
          <div className="search-caption"><span className="search-symbol">⌕</span><div><h2>Find your section</h2><p>Choose a department and enter your section code.</p></div></div>
          <form action="/routine" method="get" className="routine-search-form">
            <label>
              <span>Department</span>
              <select name="department" defaultValue={board?.selectedRoutine?.departmentCode ?? ""}>
                {(board?.departments ?? []).map((department) => (
                  <option value={department.code} key={department.id}>{department.code.toUpperCase()} · {department.name}</option>
                ))}
              </select>
            </label>
            <label className="section-input">
              <span>Section code</span>
              <input name="section" defaultValue={params.section ?? ""} placeholder="For example, 64_I" autoComplete="off" />
            </label>
            <button type="submit" className="button button-primary">Search routine <span aria-hidden="true">→</span></button>
          </form>
        </section>

        {error ? (
          <section className="empty-panel"><span className="empty-icon">!</span><h2>Routine data is unavailable</h2><p>Please try again once the database connection is restored.</p></section>
        ) : !board?.selectedRoutine ? (
          <section className="empty-panel"><span className="empty-icon">◷</span><h2>No routine has been imported yet</h2><p>The daily update checks DIU department boards for the latest routine PDFs.</p><Link href="/routine/manage" className="text-link">View routine updates <span aria-hidden="true">→</span></Link></section>
        ) : (
          <>
            {board.section ? (
              <section className="section-results" aria-live="polite">
                <div className="results-title"><div><span className="eyebrow">Section search</span><h2>{board.section}</h2></div><span className="results-count">{board.matches.length} class{board.matches.length === 1 ? "" : "es"} found</span></div>
                {board.matches.length ? (
                  <div className="match-grid">
                    {board.matches.map((match, index) => (
                      <article className="match-card" key={`${match.day}-${match.slot}-${index}`}>
                        <div className="match-time"><span>{match.day}</span><b>{match.slot}</b></div>
                        <div className="match-main"><b>{match.course || "Course details unavailable"}</b><span>{match.room || "Room unavailable"}</span></div>
                        <div className="match-teacher"><span>Teacher</span><b>{match.teacher || "—"}</b></div>
                      </article>
                    ))}
                  </div>
                ) : <div className="no-matches">No classes found for <b>{board.section}</b> in this department’s current routine.</div>}
              </section>
            ) : null}

            <section className="timetable-section">
              <div className="timetable-heading">
                <div><span className="eyebrow">Current timetable</span><h2>{board.selectedRoutine.departmentName}</h2><p>Effective from {displayDate(board.selectedRoutine.effectiveFrom)}{board.selectedRoutine.versionLabel ? ` · ${board.selectedRoutine.versionLabel}` : ""}</p></div>
                <span className="updated-pill"><span /> Updated {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date(board.selectedRoutine.parsedAt))}</span>
              </div>
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}
