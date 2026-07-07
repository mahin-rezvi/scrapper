import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import { DashboardControls } from "./DashboardControls";

export const metadata: Metadata = {
  title: "DIU Notice Tracker — Dashboard",
  description:
    "Browse and search all scraped notices from Daffodil International University departments, powered by AI analysis.",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    department?: string;
    priority?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 15;

const PRIORITY_META: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  high: {
    label: "High",
    dot: "#ef4444",
    badge: "rgba(239,68,68,.15)",
  },
  medium: {
    label: "Medium",
    dot: "#f59e0b",
    badge: "rgba(245,158,11,.15)",
  },
  low: {
    label: "Low",
    dot: "#22c55e",
    badge: "rgba(34,197,94,.12)",
  },
};

const CATEGORY_ICON: Record<string, string> = {
  exam: "📝",
  tuition: "💰",
  event: "📅",
  admission: "🎓",
  administrative: "🏛",
  result: "📊",
  other: "📌",
};

function safeStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((x): x is string => typeof x === "string");
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedDept = params.department ?? "";
  const selectedPriority = params.priority ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  const where = {
    ...(selectedDept ? { department: { code: selectedDept } } : {}),
    ...(selectedPriority
      ? { analysis: { priority: selectedPriority } }
      : {}),
  };

  const [notices, total, allDepts, recentRunLogs, stats] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: {
        analysis: true,
        resources: true,
        department: { select: { code: true, name: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.notification.count({ where }),
    prisma.department.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true,
        name: true,
        _count: { select: { notifications: true } },
      },
    }),
    prisma.runLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 1,
    }),
    prisma.notification.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const lastRun = recentRunLogs[0] ?? null;
  const lastRunLabel = lastRun?.finishedAt
    ? fmtDate(lastRun.finishedAt)
    : lastRun?.startedAt
      ? fmtDate(lastRun.startedAt)
      : "never";

  const statsByStatus = Object.fromEntries(
    stats.map((s) => [s.status, s._count._all])
  );
  const totalAll =
    (statsByStatus["new"] ?? 0) +
    (statsByStatus["processed"] ?? 0) +
    (statsByStatus["failed"] ?? 0);

  function pageHref(p: number) {
    const qs = new URLSearchParams();
    if (selectedDept) qs.set("department", selectedDept);
    if (selectedPriority) qs.set("priority", selectedPriority);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/dashboard${s ? `?${s}` : ""}`;
  }

  function filterHref(dept: string, priority: string, resetPage = true) {
    const qs = new URLSearchParams();
    if (dept) qs.set("department", dept);
    if (priority) qs.set("priority", priority);
    if (!resetPage && page > 1) qs.set("page", String(page));
    const s = qs.toString();
    return `/dashboard${s ? `?${s}` : ""}`;
  }

  return (
    <div id="dashboard-root">
      <style>{CSS}</style>

      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside id="sidebar">
        <div id="sidebar-brand">
          <span id="brand-icon">🔔</span>
          <span id="brand-name">DIU Notices</span>
        </div>

        <nav id="sidebar-nav">
          <Link href="/" className="nav-link nav-link--home">
            <span className="nav-link-label">Home</span>
          </Link>

          <p className="nav-section-label">Departments</p>

          <Link
            href={filterHref("", selectedPriority)}
            className={`nav-link${!selectedDept ? " nav-link--active" : ""}`}
          >
            <span className="nav-link-label">All Departments</span>
            <span className="nav-link-count">{totalAll}</span>
          </Link>

          {allDepts.map((d) => (
            <Link
              key={d.code}
              href={filterHref(d.code, selectedPriority)}
              className={`nav-link${selectedDept === d.code ? " nav-link--active" : ""}`}
            >
              <span className="nav-link-label nav-link-label--small">
                {d.name}
              </span>
              <span className="nav-link-count">{d._count.notifications}</span>
            </Link>
          ))}
        </nav>

        <div id="sidebar-stats">
          <p className="nav-section-label">Pipeline Status</p>
          <div className="stat-row">
            <span>Analyzed</span>
            <strong>{statsByStatus["processed"] ?? 0}</strong>
          </div>
          <div className="stat-row">
            <span>Pending</span>
            <strong>{statsByStatus["new"] ?? 0}</strong>
          </div>
          <div className="stat-row">
            <span>Failed</span>
            <strong>{statsByStatus["failed"] ?? 0}</strong>
          </div>
          {lastRun && (
            <div className="stat-row stat-row--last-run">
              <span>Last run</span>
              <span
                className={`run-pill run-pill--${lastRun.status}`}
              >
                {lastRun.status}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────── */}
      <main id="main">
        {/* Top bar */}
        <header id="topbar">
          <div id="topbar-title">
            <h1>Notice Board</h1>
            <p id="topbar-subtitle">
              {selectedDept
                ? allDepts.find((d) => d.code === selectedDept)?.name ??
                  selectedDept.toUpperCase()
                : "All departments"}{" "}
              ·{" "}
              <span id="result-count">
                {total} result{total !== 1 ? "s" : ""}
              </span>
            </p>
          </div>

          {/* Priority filter pills */}
          <div id="priority-filter">
            {(
              [
                ["", "All"],
                ["high", "🔴 High"],
                ["medium", "🟡 Medium"],
                ["low", "🟢 Low"],
              ] as const
            ).map(([val, label]) => (
              <Link
                key={val}
                href={filterHref(selectedDept, val)}
                className={`filter-pill${selectedPriority === val ? " filter-pill--active" : ""}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </header>

        <DashboardControls lastRunLabel={lastRunLabel} />

        {/* Notice grid */}
        {notices.length === 0 ? (
          <div id="empty-state">
            <div id="empty-icon">📭</div>
            <p id="empty-message">No notices found</p>
            <p id="empty-hint">
              Run the scraper from the Admin scrape control above, or make sure
              your database migration has run before the scheduled cron starts.
            </p>
          </div>
        ) : (
          <div id="card-grid">
            {notices.map((n) => {
              const a = n.analysis;
              const priority = a?.priority ?? null;
              const priorityMeta = priority
                ? PRIORITY_META[priority]
                : null;
              const category = a?.category ?? null;
              const deadline = a?.deadline ?? null;
              const actionItems = safeStringArray(a?.actionItems);
              const affectedGroups = safeStringArray(a?.affectedGroups);

              return (
                <article key={n.id} className="card">
                  {/* Card header row */}
                  <div className="card-chips">
                    <span className="chip chip--dept">
                      {n.department.code.toUpperCase()}
                    </span>

                    {priorityMeta && (
                      <span
                        className="chip chip--priority"
                        style={{
                          background: priorityMeta.badge,
                          color: priorityMeta.dot,
                        }}
                      >
                        <span
                          className="dot"
                          style={{ background: priorityMeta.dot }}
                        />
                        {priorityMeta.label}
                      </span>
                    )}

                    {category && (
                      <span className="chip chip--category">
                        {CATEGORY_ICON[category] ?? "📌"} {category}
                      </span>
                    )}

                    {a?.requiresPayment && (
                      <span className="chip chip--payment">💳 Payment</span>
                    )}

                    {deadline && (
                      <span className="chip chip--deadline">
                        ⏰ {deadline}
                      </span>
                    )}

                    <span className={`status-dot status-dot--${n.status}`} title={n.status} />
                  </div>

                  {/* Title */}
                  <h2 className="card-title">
                    <a
                      href={n.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="card-title-link"
                    >
                      {n.title}
                    </a>
                  </h2>

                  {/* AI summary or raw body excerpt */}
                  <p className="card-summary">
                    {a?.summary ?? n.bodyText.slice(0, 200)}
                    {!a?.summary && n.bodyText.length > 200 ? "…" : ""}
                  </p>

                  {/* Affected groups */}
                  {affectedGroups.length > 0 && (
                    <p className="card-groups">
                      👥 {affectedGroups.join(" · ")}
                    </p>
                  )}

                  {/* Action items */}
                  {actionItems.length > 0 && (
                    <ul className="action-list">
                      {actionItems.slice(0, 3).map((item, i) => (
                        <li key={i} className="action-item">
                          <span className="action-arrow">›</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Footer */}
                  <div className="card-footer">
                    <span className="card-date">
                      {fmtDate(n.publishedAt ?? n.createdAt)}
                    </span>

                    <div className="card-links">
                      {n.resources.map((r, i) => (
                        <a
                          key={r.id}
                          href={r.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="file-link"
                          title={r.originalUrl}
                        >
                          {r.fileType === "pdf" ? "📄" : "📎"} File {i + 1}
                        </a>
                      ))}
                      <a
                        href={n.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="source-link"
                      >
                        Source ↗
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <nav id="pagination" aria-label="Page navigation">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="page-btn">
                ← Prev
              </Link>
            )}
            <span id="page-info">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="page-btn">
                Next →
              </Link>
            )}
          </nav>
        )}
      </main>
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..900;1,14..32,300..900&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #07080f;
  --surface:  #0d0f1c;
  --border:   rgba(255,255,255,0.07);
  --border-h: rgba(129,140,248,0.3);
  --text:     #d8daf0;
  --muted:    #5a6080;
  --accent:   #818cf8;
  --accent-b: rgba(129,140,248,0.12);
}

body { background: var(--bg); color: var(--text); font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }

#dashboard-root { display: flex; min-height: 100vh; }

/* ─── Sidebar ─────────────────────────────────────────────── */
#sidebar {
  width: 252px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}

#sidebar-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1.25rem 1.1rem 1rem;
  border-bottom: 1px solid var(--border);
}
#brand-icon { font-size: 1.35rem; }
#brand-name {
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
  background: linear-gradient(135deg, #818cf8, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

#sidebar-nav { padding: 0.5rem 0.6rem; flex: 1; }

.nav-section-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  padding: 0.7rem 0.5rem 0.35rem;
}

.nav-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.42rem 0.6rem;
  border-radius: 7px;
  text-decoration: none;
  font-size: 0.8rem;
  font-weight: 500;
  color: #7880a8;
  transition: background 0.13s, color 0.13s;
  margin-bottom: 1px;
  gap: 0.5rem;
}
.nav-link:hover { background: rgba(129,140,248,0.08); color: #b0b8d8; }
.nav-link--active { background: rgba(129,140,248,0.15); color: var(--accent); }
.nav-link--home {
  margin-bottom: 0.6rem;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.03);
}

.nav-link-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-link-label--small { font-size: 0.75rem; }
.nav-link-count {
  font-size: 0.67rem;
  background: rgba(255,255,255,0.06);
  border-radius: 99px;
  padding: 0.1rem 0.45rem;
  color: #4a5278;
  flex-shrink: 0;
}

#sidebar-stats {
  padding: 0.75rem 1.1rem 1rem;
  border-top: 1px solid var(--border);
  margin-top: 0.5rem;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
  padding: 0.28rem 0;
  color: #5a6280;
}
.stat-row strong { color: #a0a8c8; font-weight: 600; }
.stat-row--last-run { margin-top: 0.4rem; padding-top: 0.5rem; border-top: 1px solid var(--border); }

.run-pill {
  font-size: 0.64rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.15rem 0.5rem;
  border-radius: 99px;
}
.run-pill--success { background: rgba(34,197,94,.15); color: #4ade80; }
.run-pill--partial  { background: rgba(245,158,11,.15); color: #fbbf24; }
.run-pill--failed   { background: rgba(239,68,68,.15);  color: #f87171; }

/* ─── Main ────────────────────────────────────────────────── */
#main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 2rem 2.25rem; gap: 1.25rem; }

#topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
#topbar-title h1 { font-size: 1.5rem; font-weight: 700; color: #e0e2f8; letter-spacing: -0.02em; }
#topbar-subtitle { font-size: 0.82rem; color: var(--muted); margin-top: 0.2rem; }
#result-count { color: #7078a8; }

#priority-filter { display: flex; gap: 0.35rem; flex-wrap: wrap; padding-top: 0.25rem; }
.filter-pill {
  padding: 0.32rem 0.85rem;
  border-radius: 99px;
  border: 1px solid var(--border);
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--muted);
  text-decoration: none;
  transition: border-color 0.13s, color 0.13s, background 0.13s;
}
.filter-pill:hover { border-color: var(--border-h); color: #a0a8cc; }
.filter-pill--active { background: var(--accent-b); border-color: var(--border-h); color: var(--accent); }

/* ─── Live controls ───────────────────────────────────────── */
#dashboard-controls {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(320px, auto);
  gap: 0.8rem;
  align-items: stretch;
}
#refresh-panel,
#scrape-panel {
  min-height: 64px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255,255,255,0.025);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
}
#refresh-panel { min-width: 0; }
#live-dot {
  width: 9px;
  height: 9px;
  border-radius: 99px;
  background: #22c55e;
  box-shadow: 0 0 0 6px rgba(34,197,94,0.08), 0 0 16px rgba(34,197,94,.45);
  flex-shrink: 0;
}
#refresh-title,
#scrape-panel label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #c6cbeb;
}
#refresh-copy {
  margin-top: 0.12rem;
  font-size: 0.74rem;
  color: var(--muted);
}
#scrape-panel input {
  width: 170px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: #080a14;
  color: #d8daf0;
  font-size: 0.78rem;
  padding: 0.48rem 0.6rem;
  outline: none;
}
#scrape-panel input:focus { border-color: var(--border-h); }
.control-button {
  border: 1px solid var(--border-h);
  border-radius: 7px;
  background: var(--accent-b);
  color: var(--accent);
  font-size: 0.76rem;
  font-weight: 700;
  padding: 0.48rem 0.75rem;
  cursor: pointer;
  transition: background 0.13s, border-color 0.13s;
  white-space: nowrap;
}
.control-button:hover:not(:disabled) { background: rgba(129,140,248,0.2); }
.control-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
#control-message {
  grid-column: 1 / -1;
  margin-top: -0.3rem;
  color: #8790bd;
  font-size: 0.76rem;
}

/* ─── Card grid ───────────────────────────────────────────── */
#card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 0.9rem;
}

.card {
  background: linear-gradient(150deg, #0e1020 0%, #10121f 100%);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.15rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.15s;
}
.card:hover {
  border-color: var(--border-h);
  box-shadow: 0 8px 40px rgba(0,0,0,0.45);
  transform: translateY(-1px);
}

.card-chips {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.chip {
  font-size: 0.67rem;
  font-weight: 600;
  padding: 0.14rem 0.5rem;
  border-radius: 5px;
}
.chip--dept {
  background: rgba(99,102,241,0.15);
  color: var(--accent);
  border: 1px solid rgba(99,102,241,0.22);
  letter-spacing: 0.05em;
}
.chip--priority {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  border-radius: 99px;
  padding: 0.14rem 0.55rem;
}
.dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.chip--category {
  background: rgba(255,255,255,0.05);
  color: #6878a8;
  text-transform: capitalize;
}
.chip--payment {
  background: rgba(245,158,11,0.1);
  color: #f59e0b;
}
.chip--deadline {
  background: rgba(249,115,22,0.1);
  color: #fb923c;
  margin-left: auto;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-left: auto;
}
.chip--deadline ~ .status-dot { margin-left: 0; }
.status-dot--processed { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,.4); }
.status-dot--new       { background: #f59e0b; }
.status-dot--failed    { background: #ef4444; }

.card-title { font-size: 0.92rem; font-weight: 600; line-height: 1.45; color: #ccd0f0; }
.card-title-link {
  text-decoration: none;
  color: inherit;
  transition: color 0.13s;
}
.card-title-link:hover { color: var(--accent); }

.card-summary {
  font-size: 0.8rem;
  color: #5a6488;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-groups {
  font-size: 0.75rem;
  color: #485070;
}

.action-list { list-style: none; display: flex; flex-direction: column; gap: 0.2rem; }
.action-item {
  display: flex;
  gap: 0.4rem;
  font-size: 0.76rem;
  color: #5060a0;
  line-height: 1.4;
}
.action-arrow { color: #6366f1; flex-shrink: 0; font-weight: 700; }

.card-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.55rem;
  border-top: 1px solid rgba(255,255,255,0.05);
  flex-wrap: wrap;
  margin-top: auto;
}
.card-date { font-size: 0.7rem; color: #363c60; }
.card-links { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-left: auto; }

.file-link, .source-link {
  font-size: 0.7rem;
  font-weight: 500;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  text-decoration: none;
  transition: background 0.13s;
  border: 1px solid;
}
.file-link {
  background: rgba(99,102,241,0.09);
  border-color: rgba(99,102,241,0.2);
  color: var(--accent);
}
.file-link:hover { background: rgba(99,102,241,0.18); }
.source-link {
  background: rgba(255,255,255,0.04);
  border-color: var(--border);
  color: #5060a0;
}
.source-link:hover { background: rgba(255,255,255,0.08); color: #8090c0; }

/* ─── Empty state ─────────────────────────────────────────── */
#empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6rem 2rem;
  gap: 0.75rem;
  text-align: center;
  color: #3a4060;
}
#empty-icon { font-size: 3rem; }
#empty-message { font-size: 1rem; font-weight: 500; color: #4a5278; }
#empty-hint { font-size: 0.8rem; max-width: 420px; line-height: 1.6; }
#empty-hint code {
  background: rgba(255,255,255,0.06);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-family: monospace;
  color: var(--accent);
  font-size: 0.75rem;
}

/* ─── Pagination ──────────────────────────────────────────── */
#pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.75rem 0 1.5rem;
}
.page-btn {
  padding: 0.45rem 1.1rem;
  border-radius: 8px;
  background: var(--accent-b);
  border: 1px solid var(--border-h);
  color: var(--accent);
  font-size: 0.82rem;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.13s;
}
.page-btn:hover { background: rgba(129,140,248,0.2); }
#page-info { font-size: 0.8rem; color: var(--muted); }

/* ─── Responsive ──────────────────────────────────────────── */
@media (max-width: 820px) {
  #sidebar { display: none; }
  #main { padding: 1.25rem; }
  #card-grid { grid-template-columns: 1fr; }
  #topbar { flex-direction: column; }
  #dashboard-controls { grid-template-columns: 1fr; }
  #scrape-panel { flex-wrap: wrap; }
  #scrape-panel input { flex: 1; min-width: 160px; }
}
`;
