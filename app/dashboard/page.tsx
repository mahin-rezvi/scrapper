import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import DashboardAutoRefresh from "@/app/dashboard/DashboardAutoRefresh";
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

function buildNoticeUrl(
  params: { q?: string; department?: string; category?: string },
  cursor?: string,
) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.department) search.set("department", params.department);
  if (params.category) search.set("category", params.category);
  if (cursor) search.set("cursor", cursor);
  return `/dashboard${search.size ? `?${search.toString()}` : ""}`;
}

function NoticeCard({ notice }: { notice: NoticeSummary }) {
  const excerpt = notice.bodyText.trim().slice(0, 220);
  return (
    <article className="notice-card">
      <div className="notice-meta"><span>{notice.departmentCode.toUpperCase()}</span>{notice.category ? <span>{notice.category}</span> : null}</div>
      <h2><a href={notice.sourceUrl} target="_blank" rel="noopener noreferrer">{notice.title}</a></h2>
      <p>{excerpt || "Open the official notice for details."}{notice.bodyText.length > excerpt.length ? "…" : ""}</p>
      <footer>
        <time dateTime={notice.publishedAt ?? undefined}>{dateLabel(notice.publishedAt)}</time>
        {notice.attachments.length ? (
          <div className="notice-attachments">
            {notice.attachments.map((attachment, index) => (
              <a href={attachment} target="_blank" rel="noopener noreferrer" key={`${attachment}-${index}`}>
                {notice.attachments.length === 1 ? "Attachment ↗" : `File ${index + 1} ↗`}
              </a>
            ))}
          </div>
        ) : null}
      </footer>
    </article>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; department?: string; category?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  let data: Awaited<ReturnType<typeof dashboardData>> | null = null;
  try {
    data = await dashboardData({
      query: params.q,
      department: params.department,
      category: params.category,
      cursor: params.cursor,
    });
  } catch (error) {
    console.error("Notice dashboard data unavailable:", error);
  }

  return (
    <main className="product-page dashboard-page">
      <div className="product-wrap">
        <DashboardAutoRefresh />
        <SiteHeader />
        <section className="page-heading dashboard-heading">
          <div><span className="eyebrow">The DIU notice board, gathered</span><h1>Campus updates</h1><p>Search official notices by topic, department, or category.</p></div>
          <Link className="button button-primary" href="/routine">Find my routine <span aria-hidden="true">→</span></Link>
        </section>

        {!data ? (
          <section className="empty-panel"><span className="empty-icon">!</span><h2>Notice storage is unavailable</h2><p>Please try again once the database connection is restored.</p></section>
        ) : (
          <>
            <section className="notice-overview">
              <div className="overview-label"><span className="overview-pulse" /> Official notice archive</div>
              <div className="overview-departments">{data.departments.length} departments tracked</div>
              <div className="overview-sync">{data.lastRun ? `Last sync ${data.lastRun.status} · ${dateLabel(data.lastRun.finishedAt)}` : "Waiting for the first notice sync"}</div>
            </section>
            <section className="notice-filter panel" aria-label="Filter notices">
              <form action="/dashboard" method="get">
                <label className="notice-query">
                  <span>Search all notices</span>
                  <input name="q" type="search" defaultValue={params.q ?? ""} placeholder="Try “scholarship”, “exam”, or “result”" maxLength={120} />
                </label>
                <label>
                  <span>Department</span>
                  <select name="department" defaultValue={params.department ?? ""}>
                    <option value="">All departments</option>
                    {data.departments.map((department) => <option value={department.code} key={department.code}>{department.code.toUpperCase()} · {department.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Category</span>
                  <select name="category" defaultValue={params.category ?? ""}>
                    <option value="">All categories</option>
                    {data.categories.map((category) => <option value={category} key={category}>{category}</option>)}
                  </select>
                </label>
                <button className="button button-primary" type="submit">Search notices <span aria-hidden="true">→</span></button>
                <Link className="filter-reset" href="/dashboard">Clear filters</Link>
              </form>
            </section>
            <div className="notice-list-heading">
              <h2>{params.q || params.department || params.category ? "Search results" : "Latest notices"}</h2>
              <span>{data.total.toLocaleString()} notice{data.total === 1 ? "" : "s"}</span>
            </div>
            {data.notices.length ? (
              <section className="notice-grid" aria-label="Latest notices">
                {data.notices.map((notice) => <NoticeCard key={notice.id} notice={notice} />)}
              </section>
            ) : (
              <section className="empty-panel"><span className="empty-icon">⌕</span><h2>No matching notices</h2><p>Try a broader keyword or clear one of the filters.</p><Link className="text-link" href="/dashboard">Clear filters →</Link></section>
            )}
            {data.hasNextPage && data.nextCursor ? (
              <nav className="notice-pagination" aria-label="Notice pages">
                <span>Showing {data.notices.length} of {data.total.toLocaleString()}</span>
                <Link className="button button-outline" href={buildNoticeUrl(params, data.nextCursor)}>Load older notices <span aria-hidden="true">↓</span></Link>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
