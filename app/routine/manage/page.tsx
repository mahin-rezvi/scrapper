import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import RoutineSyncTrigger from "@/app/routine/manage/RoutineSyncTrigger";
import { routineManagementData } from "@/lib/db/routines";

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

export default async function RoutineManagementPage() {
  let data: Awaited<ReturnType<typeof routineManagementData>> | null = null;
  try {
    data = await routineManagementData();
  } catch (error) {
    console.error("Routine management data unavailable:", error);
  }

  return (
    <main className="product-page management-page">
      <div className="product-wrap">
        <SiteHeader />
        <section className="page-heading">
          <div><span className="eyebrow">Routine operations</span><h1>Routine management</h1><p>Monitor the latest timetable PDFs and publish updates for students.</p></div>
          <Link className="button button-outline" href="/routine">Open routine search <span aria-hidden="true">↗</span></Link>
        </section>

        <RoutineSyncTrigger enabled={Boolean(process.env.ROUTINE_SYNC_SECRET)} />

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
      </div>
    </main>
  );
}
