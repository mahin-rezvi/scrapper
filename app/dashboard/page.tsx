import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { dashboardData, type NoticeSummary } from "@/lib/db/notices";

export const metadata: Metadata = {
  title: "DIUBoard — Department notices",
  description: "Recent notices from Daffodil International University departments.",
};

export const dynamic = "force-dynamic";

function dateLabel(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(date);
}

function NoticeCard({ notice }: { notice: NoticeSummary }) {
  const excerpt = notice.bodyText.trim().slice(0, 220);
  return (
    <article className="notice-card">
      <div className="notice-meta"><span>{notice.departmentCode.toUpperCase()}</span>{notice.category ? <span>{notice.category}</span> : null}</div>
      <h2><a href={notice.sourceUrl} target="_blank" rel="noreferrer">{notice.title}</a></h2>
      <p>{excerpt || "Open the official notice for details."}{notice.bodyText.length > excerpt.length ? "…" : ""}</p>
      <footer><span>{dateLabel(notice.publishedAt)}</span><span>{notice.attachments.length ? `${notice.attachments.length} attachment${notice.attachments.length === 1 ? "" : "s"}` : "Official notice"}</span></footer>
    </article>
  );
}

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof dashboardData>> | null = null;
  try {
    data = await dashboardData();
  } catch (error) {
    console.error("Notice dashboard data unavailable:", error);
  }

  return (
    <main className="product-page dashboard-page">
      <div className="product-wrap">
        <SiteHeader />
        <section className="page-heading dashboard-heading">
          <div><span className="eyebrow">The DIU notice board, gathered</span><h1>Campus updates</h1><p>Recent announcements from departments and university offices.</p></div>
          <Link className="button button-primary" href="/routine">Find my routine <span aria-hidden="true">→</span></Link>
        </section>

        {!data ? (
          <section className="empty-panel"><span className="empty-icon">!</span><h2>Notice storage is unavailable</h2><p>Check the Supabase settings and run the project migration before opening the dashboard.</p></section>
        ) : (
          <>
            <section className="notice-overview">
              <div className="overview-label"><span className="overview-pulse" /> Live notice feed</div>
              <div className="overview-departments">{data.departments.length} departments tracked</div>
              <div className="overview-sync">{data.lastRun ? `Last sync ${data.lastRun.status} · ${dateLabel(data.lastRun.finishedAt)}` : "Waiting for the first notice sync"}</div>
            </section>
            <div className="department-strip" aria-label="Tracked departments">
              {data.departments.map((department) => <span key={department.code}>{department.code.toUpperCase()} <b>{department.noticeCount}</b></span>)}
            </div>
            {data.notices.length ? (
              <section className="notice-grid" aria-label="Latest notices">
                {data.notices.map((notice) => <NoticeCard key={notice.id} notice={notice} />)}
              </section>
            ) : (
              <section className="empty-panel"><span className="empty-icon">◉</span><h2>No notices have been synced yet</h2><p>Once the scheduled sync runs, recent department announcements will appear here.</p></section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
