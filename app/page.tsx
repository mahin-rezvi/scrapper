import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type HomeData = {
  notices: number;
  departments: number;
  processed: number;
  failed: number;
  lastRun: {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    message: string;
  } | null;
  recent: Array<{
    id: string;
    title: string;
    sourceUrl: string;
    publishedAt: Date | null;
    createdAt: Date;
    department: { code: string; name: string };
    analysis: { summary: string; priority: string | null } | null;
  }>;
  error: string | null;
};

async function getHomeData(): Promise<HomeData> {
  try {
    const [notices, departments, processed, failed, lastRun, recent] =
      await Promise.all([
        prisma.notification.count(),
        prisma.department.count(),
        prisma.notification.count({ where: { status: "processed" } }),
        prisma.notification.count({ where: { status: "failed" } }),
        prisma.runLog.findFirst({
          orderBy: { startedAt: "desc" },
          select: {
            status: true,
            startedAt: true,
            finishedAt: true,
            message: true,
          },
        }),
        prisma.notification.findMany({
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: 6,
          include: {
            department: { select: { code: true, name: true } },
            analysis: { select: { summary: true, priority: true } },
          },
        }),
      ]);

    return {
      notices,
      departments,
      processed,
      failed,
      lastRun,
      recent,
      error: null,
    };
  } catch (err) {
    return {
      notices: 0,
      departments: 0,
      processed: 0,
      failed: 0,
      lastRun: null,
      recent: [],
      error: String(err),
    };
  }
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return "Not available";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function HomePage() {
  const data = await getHomeData();
  const healthy = !data.error && data.departments > 0;

  return (
    <main id="home">
      <style>{CSS}</style>

      <header id="home-nav">
        <Link href="/" id="brand">
          <span id="brand-mark" aria-hidden="true" />
          DIU Notice Tracker
        </Link>
        <nav id="nav-links" aria-label="Primary navigation">
          <Link href="/dashboard">Dashboard</Link>
          <a href="/api/pipeline/status" target="_blank" rel="noreferrer">
            Status API
          </a>
        </nav>
      </header>

      <section id="hero">
        <div id="hero-copy">
          <p id="kicker">Automated DIU notice monitoring</p>
          <h1>Fresh university notices, searchable and summarized.</h1>
          <p id="hero-text">
            The tracker scrapes official Daffodil International University
            department notice boards, saves new notices to Postgres, archives
            attachments, and prepares AI summaries for quick scanning.
          </p>
          <div id="hero-actions">
            <Link href="/dashboard" className="primary-action">
              Open dashboard
            </Link>
            <a href="#recent" className="secondary-action">
              View latest
            </a>
          </div>
        </div>

        <aside id="status-panel" aria-label="System status">
          <div className="status-row">
            <span>System</span>
            <strong className={healthy ? "ok" : "warn"}>
              {healthy ? "Connected" : "Needs setup"}
            </strong>
          </div>
          <div className="status-row">
            <span>Total notices</span>
            <strong>{data.notices}</strong>
          </div>
          <div className="status-row">
            <span>Departments</span>
            <strong>{data.departments}</strong>
          </div>
          <div className="status-row">
            <span>Last scrape</span>
            <strong>{data.lastRun ? data.lastRun.status : "Never"}</strong>
          </div>
          <p id="status-note">
            {data.lastRun
              ? `${fmtDate(data.lastRun.finishedAt ?? data.lastRun.startedAt)} - ${data.lastRun.message}`
              : "Run the scraper once from the dashboard after deployment."}
          </p>
        </aside>
      </section>

      {data.error && (
        <section id="setup-warning">
          <h2>Database setup needed</h2>
          <p>
            The app could not read the production database yet. Run migrations
            against your Neon database, then open the dashboard and run the
            scraper once.
          </p>
        </section>
      )}

      <section id="metrics" aria-label="Notice metrics">
        <div className="metric">
          <span>{data.notices}</span>
          <p>Total notices</p>
        </div>
        <div className="metric">
          <span>{data.processed}</span>
          <p>AI analyzed</p>
        </div>
        <div className="metric">
          <span>{data.failed}</span>
          <p>Needs review</p>
        </div>
      </section>

      <section id="recent">
        <div id="section-heading">
          <div>
            <p id="section-kicker">Latest</p>
            <h2>Recent notices</h2>
          </div>
          <Link href="/dashboard">Browse all</Link>
        </div>

        {data.recent.length === 0 ? (
          <div id="empty-home">
            <h3>No notices yet</h3>
            <p>
              Use the dashboard admin scrape control after migrations are
              deployed. The scheduled cron will keep it updated after that.
            </p>
          </div>
        ) : (
          <div id="notice-list">
            {data.recent.map((notice) => (
              <article key={notice.id} className="notice-row">
                <div>
                  <span className="dept-chip">
                    {notice.department.code.toUpperCase()}
                  </span>
                  {notice.analysis?.priority && (
                    <span className={`priority priority-${notice.analysis.priority}`}>
                      {notice.analysis.priority}
                    </span>
                  )}
                </div>
                <h3>
                  <a href={notice.sourceUrl} target="_blank" rel="noreferrer">
                    {notice.title}
                  </a>
                </h3>
                <p>
                  {notice.analysis?.summary &&
                  notice.analysis.summary !== "Analysis failed"
                    ? notice.analysis.summary
                    : `${notice.department.name} notice published ${fmtDate(
                        notice.publishedAt ?? notice.createdAt
                      )}.`}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const CSS = `
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: #f6f7fb; color: #171923; }
#home {
  min-height: 100vh;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
#home-nav {
  height: 68px;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
#brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #111827;
  text-decoration: none;
  font-weight: 800;
}
#brand-mark {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: #2563eb;
  box-shadow: 6px 6px 0 #16a34a;
}
#nav-links { display: flex; align-items: center; gap: 16px; }
#nav-links a {
  color: #4b5563;
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 650;
}
#nav-links a:hover { color: #111827; }
#hero {
  max-width: 1120px;
  margin: 0 auto;
  padding: 64px 24px 36px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 40px;
  align-items: center;
}
#kicker, #section-kicker {
  margin: 0 0 10px;
  color: #2563eb;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h1 {
  max-width: 760px;
  margin: 0;
  color: #0f172a;
  font-size: clamp(2.4rem, 7vw, 4.8rem);
  line-height: 0.98;
  letter-spacing: 0;
}
#hero-text {
  max-width: 680px;
  margin: 22px 0 0;
  color: #4b5563;
  font-size: 1.05rem;
  line-height: 1.75;
}
#hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.primary-action,
.secondary-action {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 0 18px;
  font-weight: 800;
  text-decoration: none;
}
.primary-action { background: #2563eb; color: white; }
.primary-action:hover { background: #1d4ed8; }
.secondary-action {
  background: white;
  color: #1f2937;
  border: 1px solid #d8dde8;
}
#status-panel,
#setup-warning,
.metric,
#empty-home,
.notice-row {
  background: white;
  border: 1px solid #dfe4ee;
  border-radius: 8px;
}
#status-panel { padding: 18px; box-shadow: 0 18px 50px rgba(15,23,42,0.08); }
.status-row {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #edf0f6;
  gap: 16px;
}
.status-row span { color: #64748b; font-size: 0.9rem; }
.status-row strong { color: #111827; text-transform: capitalize; }
.ok { color: #15803d !important; }
.warn { color: #b45309 !important; }
#status-note { margin: 16px 0 0; color: #64748b; font-size: 0.88rem; line-height: 1.55; }
#setup-warning {
  max-width: 1072px;
  margin: 0 auto 24px;
  padding: 18px;
  border-color: #f8d88a;
  background: #fffbeb;
}
#setup-warning h2 { margin: 0 0 6px; font-size: 1rem; color: #92400e; }
#setup-warning p { margin: 0; color: #78350f; line-height: 1.55; }
#metrics {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px 36px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.metric { padding: 18px; }
.metric span { color: #111827; font-size: 2rem; font-weight: 850; }
.metric p { margin: 4px 0 0; color: #64748b; font-weight: 650; }
#recent {
  max-width: 1120px;
  margin: 0 auto;
  padding: 12px 24px 64px;
}
#section-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  margin-bottom: 16px;
}
#section-heading h2 { margin: 0; font-size: 1.55rem; color: #111827; }
#section-heading a { color: #2563eb; font-weight: 800; text-decoration: none; }
#empty-home { padding: 28px; }
#empty-home h3 { margin: 0 0 6px; }
#empty-home p { margin: 0; color: #64748b; line-height: 1.65; }
#notice-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.notice-row { padding: 16px; }
.notice-row h3 {
  margin: 10px 0 8px;
  font-size: 1rem;
  line-height: 1.45;
}
.notice-row h3 a { color: #111827; text-decoration: none; }
.notice-row h3 a:hover { color: #2563eb; }
.notice-row p {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dept-chip,
.priority {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 0.72rem;
  font-weight: 850;
  text-transform: uppercase;
}
.dept-chip { background: #e0ecff; color: #1d4ed8; }
.priority { margin-left: 6px; }
.priority-high { background: #fee2e2; color: #b91c1c; }
.priority-medium { background: #fef3c7; color: #a16207; }
.priority-low { background: #dcfce7; color: #15803d; }
@media (max-width: 820px) {
  #home-nav { height: auto; padding-top: 18px; align-items: flex-start; }
  #nav-links { gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  #hero { grid-template-columns: 1fr; padding-top: 42px; }
  #metrics { grid-template-columns: 1fr; }
  #notice-list { grid-template-columns: 1fr; }
}
`;
