import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import RoutineAutoRefresh from "@/app/routine/RoutineAutoRefresh";
import SavedSections from "@/app/routine/SavedSections";
import { routineBoardData } from "@/lib/db/routines";
import { parseRoutineSearchType } from "@/lib/routines/search";

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
  searchParams: Promise<{ department?: string; section?: string; searchType?: string }>;
}) {
  const params = await searchParams;
  const searchType = parseRoutineSearchType(params.searchType);
  let board: Awaited<ReturnType<typeof routineBoardData>> | null = null;
  let error = false;
  try {
    board = await routineBoardData(params.department, params.section, searchType);
  } catch (cause) {
    console.error("Routine page data unavailable:", cause);
    error = true;
  }

  return (
    <main className="product-page routine-page">
      <div className="product-wrap">
        <SiteHeader />
        <RoutineAutoRefresh />
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

        <section className="routine-search panel" aria-label="Search routines">
          <div className="search-caption"><span className="search-symbol">⌕</span><div><h2>Search the timetable</h2><p>Find classes by section, teacher, course, or room.</p></div></div>
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
              <span>{searchType === "section" ? "Section code" : searchType[0].toUpperCase() + searchType.slice(1)}</span>
              <input name="section" defaultValue={params.section ?? ""} placeholder={searchType === "section" ? "For example, 64_I" : `Search by ${searchType}`} autoComplete="off" />
            </label>
            <label>
              <span>Search by</span>
              <select name="searchType" defaultValue={searchType}>
                <option value="section">Section</option>
                <option value="teacher">Teacher</option>
                <option value="course">Course</option>
                <option value="room">Room</option>
              </select>
            </label>
            <button type="submit" className="button button-primary">Search routine <span aria-hidden="true">→</span></button>
          </form>
          <SavedSections
            department={board?.selectedRoutine?.departmentCode ?? ""}
            section={searchType === "section" ? params.section ?? "" : ""}
          />
        </section>

        {error ? (
          <section className="empty-panel"><span className="empty-icon">!</span><h2>Routine data is unavailable</h2><p>Please try again once the database connection is restored.</p></section>
        ) : !board?.selectedRoutine ? (
          <section className="empty-panel"><span className="empty-icon">◷</span><h2>No routine has been imported yet</h2><p>Department boards are checked every five minutes; a timetable is imported only when the department&apos;s latest notice is a class routine.</p><Link href="/routine/manage" className="text-link">View routine updates <span aria-hidden="true">→</span></Link></section>
        ) : (
          <>
            {board.section ? (
              <section className="section-results" aria-live="polite">
                <div className="results-title"><div><span className="eyebrow">{searchType[0].toUpperCase() + searchType.slice(1)} search</span><h2>{board.section}</h2></div><span className="results-count">{board.matches.length} class{board.matches.length === 1 ? "" : "es"} found</span></div>
                {board.matches.length ? (
                  <div className="match-grid">
                    {board.matches.map((match, index) => (
                      <article className="match-card" key={`${match.day}-${match.slot}-${index}`}>
                        <div className="match-time"><span>{match.day}</span><b>{match.slot}</b></div>
                        <div className="match-main"><b>{match.course || "Course details unavailable"}</b><span>{match.room || "Room unavailable"}</span></div>
                        <div className="match-teacher">
                          <span>Teacher</span>
                          <b>{match.teacher || "—"}</b>
                          <span>{match.sectionCode ? `Section · ${match.sectionCode}` : "Section unavailable"}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <div className="no-matches">No classes found for <b>{board.section}</b> in this department’s current routine.</div>}
              </section>
            ) : null}

            <section className="timetable-section">
              <div className="timetable-heading">
                <div><span className="eyebrow">Current timetable</span><h2>{board.selectedRoutine.departmentName}</h2><p>Effective from {displayDate(board.selectedRoutine.effectiveFrom)}{board.selectedRoutine.versionLabel ? ` · ${board.selectedRoutine.versionLabel}` : ""}</p></div>
                <span className={board.selectedRoutine.isCurrent ? "updated-pill" : "updated-pill updated-pill-fallback"}>
                  <span />{board.selectedRoutine.isCurrent ? "Updated" : "Previous class routine"} {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date(board.selectedRoutine.parsedAt))}
                </span>
              </div>
              {!board.selectedRoutine.isCurrent ? (
                <p className="routine-fallback-note">The latest imported notice was not a class timetable, so the last recognized class routine is shown.</p>
              ) : null}
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
