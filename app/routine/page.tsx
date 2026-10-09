import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import RoutineAutoRefresh from "@/app/routine/RoutineAutoRefresh";
import SavedSections from "@/app/routine/SavedSections";
import { routineBoardData } from "@/lib/db/routines";
import { parseRoutineSearchType } from "@/lib/routines/search";

export const dynamic = "force-dynamic";

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
  const matchesByDay = new Map<string, NonNullable<typeof board>["matches"]>();
  for (const match of board?.matches ?? []) {
    const dayMatches = matchesByDay.get(match.day) ?? [];
    dayMatches.push(match);
    matchesByDay.set(match.day, dayMatches);
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
          <section className="empty-panel"><span className="empty-icon">◷</span><h2>No routine has been imported yet</h2><p>Department boards are checked every ten hours; a timetable is imported only when the department&apos;s latest notice is a class routine.</p><Link href="/routine/manage" className="text-link">View routine updates <span aria-hidden="true">→</span></Link></section>
        ) : (
          <>
            {board.section ? (
              <section className="section-results" aria-live="polite">
                <div className="results-title"><div><span className="eyebrow">Your weekly schedule · {searchType} search</span><h2>{board.section}</h2><p className="section-results-caption">Classes from the latest imported timetable, arranged by day.</p></div><span className="results-count">{board.matches.length} class{board.matches.length === 1 ? "" : "es"} found</span></div>
                {board.matches.length ? (
                  <div className="section-schedule">
                    {[...matchesByDay.entries()].map(([day, matches], dayIndex) => (
                      <section className="section-day" key={day}>
                        <header className="section-day-heading">
                          <span className="section-day-number">{String(dayIndex + 1).padStart(2, "0")}</span>
                          <div><span className="eyebrow">Day {dayIndex + 1}</span><h3>{day}</h3></div>
                          <span className="section-day-count">{matches.length} class{matches.length === 1 ? "" : "es"}</span>
                        </header>
                        <div className="section-class-list">
                          {matches.map((match, index) => (
                            <article className="section-class-card" key={`${match.day}-${match.slot}-${index}`}>
                              <div className="section-class-time"><span>TIME</span><b>{match.slot}</b></div>
                              <div className="section-class-course"><span>COURSE</span><b>{match.course || "Course details unavailable"}</b><small>{match.sectionCode ? `Section ${match.sectionCode}` : "Section details unavailable"}</small></div>
                              <div className="section-class-teacher"><span>INSTRUCTOR</span><b>{match.teacher || "Details unavailable"}</b></div>
                              <div className="section-class-room"><span>ROOM</span><b>{match.room || "TBA"}</b></div>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : <div className="no-matches">No classes found for <b>{board.section}</b> in this department’s current routine.</div>}
              </section>
            ) : null}

          </>
        )}
      </div>
    </main>
  );
}
