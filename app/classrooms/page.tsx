import SiteHeader from "@/app/components/SiteHeader";
import { classroomAvailabilityData } from "@/lib/db/routines";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClassroomsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[]; slot?: string | string[] }>;
}) {
  const params = await searchParams;
  let data: Awaited<ReturnType<typeof classroomAvailabilityData>> | null = null;
  let error = false;
  try {
    data = await classroomAvailabilityData(firstParam(params.date), firstParam(params.slot));
  } catch (cause) {
    console.error("Classroom availability data unavailable:", cause);
    error = true;
  }

  return (
    <main className="product-page classrooms-page">
      <div className="product-wrap">
        <SiteHeader />
        <section className="page-heading routine-heading">
          <div>
            <span className="eyebrow">Find a place to study</span>
            <h1>Classrooms</h1>
            <p>Search the imported class routines for rooms without a scheduled class.</p>
          </div>
        </section>

        <section className="classroom-search panel" aria-label="Search for an empty classroom">
          <div className="search-caption">
            <span className="search-symbol" aria-hidden="true">⌕</span>
            <div><h2>Check room availability</h2><p>Choose a date and a timetable slot.</p></div>
          </div>
          <form action="/classrooms" method="get" className="classroom-search-form">
            <label>
              <span>Date</span>
              <input type="date" name="date" defaultValue={data?.date ?? firstParam(params.date)} required />
            </label>
            <label>
              <span>Time slot</span>
              <select name="slot" defaultValue={data?.selectedSlot ?? ""} required disabled={error || !data?.slots.length}>
                <option value="" disabled>{error ? "Database unavailable" : data?.slots.length ? "Select a time slot" : "No slots for this day"}</option>
                {(data?.slots ?? []).map((slot) => <option value={slot.value} key={slot.value}>{slot.label}</option>)}
              </select>
            </label>
            <button type="submit" className="button button-primary" disabled={error}>Find empty rooms <span aria-hidden="true">→</span></button>
          </form>
          <p className="classroom-search-note">Class routines repeat weekly, so the date selects its weekday.</p>
        </section>

        {error ? (
          <section className="empty-panel"><span className="empty-icon">!</span><h2>Room data is unavailable</h2><p>Please try again once the routine database connection is restored.</p></section>
        ) : !data?.slots.length ? (
          <section className="empty-panel"><span className="empty-icon">◷</span><h2>No timetable slots found for {data?.dayName ?? "this day"}</h2><p>Room availability depends on the latest class routines imported for each department.</p></section>
        ) : data.searched ? (
          <section className="classroom-results" aria-live="polite">
            <div className="results-title">
              <div>
                <span className="eyebrow">{data.dayName} · {data.date}</span>
                <h2>Empty rooms</h2>
                <p className="section-results-caption">During {data.selectedSlotLabel}</p>
              </div>
              <span className="results-count">{data.availableRooms.length} available · {data.occupiedRoomCount} occupied</span>
            </div>
            {data.availableRooms.length ? (
              <div className="classroom-room-grid">
                {data.availableRooms.map((room) => <article className="classroom-room-card" key={room}><span aria-hidden="true">⌂</span><b>{room}</b><small>Available for this slot</small></article>)}
              </div>
            ) : (
              <div className="no-matches">No empty rooms were found in the imported routines for this time slot.</div>
            )}
            <p className="classroom-coverage-note">Availability is based on rooms listed in the latest imported department routines. Unlisted rooms may not appear here.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
