import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import { DashboardControls } from "./DashboardControls";
import { NotificationAssistant } from "./NotificationAssistant";
import ThemeToggle from "@/app/components/ThemeToggle";

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

const PAGE_SIZE = 50;

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

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
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

  const [notices, total, allDepts, recentRunLogs] = await Promise.all([
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
  ]);

  const stats = await prisma.notification.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const lastRun = recentRunLogs[0] ?? null;
  const lastRunLabel = lastRun?.finishedAt
    ? fmtDateTime(lastRun.finishedAt)
    : lastRun?.startedAt
      ? fmtDateTime(lastRun.startedAt)
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
          <span id="brand-name"><Link href="/">DIU Notices</Link></span>
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

          <div id="topbar-actions">
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
            <ThemeToggle />
          </div>
        </header>

        <DashboardControls lastRunLabel={lastRunLabel} />
        <NotificationAssistant department={selectedDept || undefined} />

        {/* Notice grid */}
        {notices.length === 0 ? (
          <div id="empty-state">
            <div id="empty-icon">📭</div>
            <p id="empty-message">No notices found</p>
            <p id="empty-hint">
              Make sure your database migration has run and wait for the scheduled
              cron to populate notices automatically.
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
              const summary =
                a?.summary && a.summary !== "Analysis failed"
                  ? a.summary
                  : null;
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
                    {summary ?? n.bodyText.slice(0, 200)}
                    {!summary && n.bodyText.length > 200 ? "…" : ""}
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
  --bg: var(--background);
  --surface: var(--surface);
  --border: var(--border);
  --border-h: var(--accent-light);
  --text: var(--foreground);
  --muted: var(--muted);
  --accent: var(--accent);
  --accent-b: rgba(129,140,248,0.12);
}

body { background: var(--bg); color: var(--text); font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }

#dashboard-root { display: flex; min-height: 100vh; }

/* ─── Sidebar ─────────────────────────────────────────────── */
#sidebar {
  width: 280px;
  flex-shrink: 0;
  background:  var(--surface) 0%, var(--surface-soft) 100%);
  border-right: 1px solid rgba(148, 163, 184, 0.08);
  display: flex;
  padding-left: 20px;
  padding-bottom: 20px;
  flex-direction: column;
  gap: 0;
  
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(148,163,184,0.35) transparent;
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
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
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
  color: var(--muted);
  transition: background 0.13s, color 0.13s;
  margin-bottom: 1px;
  gap: 0.5rem;
}
.nav-link:hover { background: rgba(129,140,248,0.08); color: var(--foreground); }
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
  color: var(--muted);
  flex-shrink: 0;
}

#sidebar-stats {
  padding: 0.75rem 1.1rem 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  margin-top: 0.5rem;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
  padding: 0.28rem 0;
  color: var(--muted);
}
.stat-row strong { color: var(--foreground); font-weight: 600; }
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
#topbar-title h1 { font-size: 1.5rem; font-weight: 700; color: var(--foreground); letter-spacing: -0.02em; }
#topbar-subtitle { font-size: 0.82rem; color: var(--muted); margin-top: 0.2rem; }
#result-count { color: var(--muted); }

#topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  flex-wrap: wrap;
}

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
.filter-pill:hover { border-color: var(--border-h); color: var(--foreground); }
.filter-pill--active { background: var(--accent-b); border-color: var(--border-h); color: var(--accent); }

/* ─── Live controls ───────────────────────────────────────── */
#dashboard-controls {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(320px, auto);
  gap: 0.8rem;
  align-items: stretch;
}
.dashboard-controls-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 20px;
  margin-left: 10px;
  margin-right: 10px;
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015));
  border: 1px solid rgba(148,163,184,0.14);
  backdrop-filter: blur(20px);
}
.dashboard-controls-status {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.dashboard-controls-dot {
  position: relative;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dashboard-controls-dot-ping {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(34,197,94,0.18);
  animation: ping 1.6s infinite;
}
.dashboard-controls-dot-core {
  position: relative;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 0 0 8px rgba(34,197,94,0.08);
}
.dashboard-controls-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--foreground);
}
.dashboard-controls-copy {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
}
.dashboard-controls-meta {
  color: var(--foreground);
  font-weight: 600;
}
@keyframes ping {
  0%, 100% { transform: scale(0.85); opacity: 0.8; }
  50% { transform: scale(1.4); opacity: 0.2; }
}
#assistant-float {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.75rem;
  z-index: 1000;
}
#assistant-panel {
  width: min(420px, calc(100vw - 2rem));
  max-height: min(80vh, 760px);
  border: 1px solid rgba(148,163,184,0.15);
  border-radius: 18px;
  background: rgba(19, 31, 56, 0.92);
  padding: 1rem;
  display: grid;
  gap: 1rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(18px);
}
#assistant-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
#assistant-label {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--foreground);
}
#assistant-copy {
  margin-top: 0.35rem;
  color: var(--muted);
  font-size: 0.78rem;
}
#assistant-close {
  border: none;
  background: transparent;
  color: var(--foreground);
  font-size: 1.05rem;
  cursor: pointer;
  padding: 0.25rem;
}
#assistant-form {
  display: grid;
  gap: 0.75rem;
}
#assistant-query {
  width: 100%;
  min-height: 104px;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 16px;
  background: rgba(15, 28, 54, 0.94);
  color: var(--foreground);
  padding: 1rem;
  font-size: 0.92rem;
  resize: vertical;
}
#assistant-query:focus {
  outline: 2px solid rgba(129,140,248,0.35);
  border-color: rgba(129,140,248,0.6);
}
#assistant-actions {
  display: flex;
  justify-content: flex-end;
}
#assistant-error {
  color: #fecaca;
  font-size: 0.82rem;
}
#assistant-response {
  border-top: 1px solid rgba(148,163,184,0.12);
  padding-top: 1rem;
  display: grid;
  gap: 0.75rem;
  max-height: 38vh;
  overflow: auto;
}
#assistant-response::-webkit-scrollbar,
#assistant-response-notices::-webkit-scrollbar,
#sidebar::-webkit-scrollbar {
  width: 8px;
}
#assistant-response::-webkit-scrollbar-thumb,
#assistant-response-notices::-webkit-scrollbar-thumb,
#sidebar::-webkit-scrollbar-thumb {
  background: rgba(148,163,184,0.22);
  border-radius: 999px;
}
#assistant-response-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}
#assistant-response-header h3 {
  margin: 0;
  font-size: 0.95rem;
}
#assistant-response p {
  color: var(--foreground);
  line-height: 1.7;
  white-space: pre-wrap;
}
#assistant-response-notices {
  display: grid;
  gap: 0.55rem;
}
#assistant-response-notices h4 {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
}
#assistant-response-notices ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.5rem;
}
#assistant-response-notices li {
  display: grid;
  gap: 0.25rem;
  padding: 0.8rem 0.95rem;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
}
#assistant-response-notices strong {
  display: block;
  font-size: 0.85rem;
  color: var(--foreground);
}
#assistant-response-notices span {
  font-size: 0.75rem;
  color: var(--muted);
}
#assistant-toggle {
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
  color: white;
  font-size: 0.9rem;
  font-weight: 700;
  padding: 0.95rem 1.15rem;
  cursor: pointer;
  box-shadow: 0 16px 30px rgba(99,102,241,0.25);
}
#assistant-toggle:hover {
  transform: translateY(-1px);
}
#assistant-toggle:focus-visible {
  outline: 2px solid rgba(129,140,248,0.65);
  outline-offset: 3px;
}
#refresh-panel {
  min-height: 64px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-alt);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
}
#refresh-panel { min-width: 0; }

.refresh-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.75rem 1rem;
  background: var(--surface);
  color: var(--foreground);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.13s, border-color 0.13s, color 0.13s;
}
.refresh-button:hover:not(:disabled) {
  background: var(--surface-alt);
}
.refresh-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.refresh-button svg {
  width: 1rem;
  height: 1rem;
  color: currentColor;
}
#live-dot {
  width: 9px;
  height: 9px;
  border-radius: 99px;
  background: #22c55e;
  box-shadow: 0 0 0 6px rgba(34,197,94,0.08), 0 0 16px rgba(34,197,94,.45);
  flex-shrink: 0;
}
#refresh-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--foreground);
}
#refresh-copy {
  margin-top: 0.12rem;
  font-size: 0.74rem;
  color: var(--muted);
}
#control-button {
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
  color: var(--muted);
  font-size: 0.76rem;
}

/* ─── Card grid ───────────────────────────────────────────── */
#card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 0.9rem;
}

.card {
  background: var(--surface);
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
  box-shadow: 0 8px 40px rgba(0,0,0,0.12);
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
.chip--status {
  text-transform: capitalize;
  background: rgba(255,255,255,0.05);
  color: #8b94bd;
}
.chip--status-processed { background: rgba(34,197,94,.12); color: #4ade80; }
.chip--status-new { background: rgba(245,158,11,.12); color: #fbbf24; }
.chip--status-failed { background: rgba(239,68,68,.12); color: #f87171; }

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

.card-title { font-size: 0.92rem; font-weight: 600; line-height: 1.45; color: var(--foreground); }
.card-title-link {
  text-decoration: none;
  color: inherit;
  transition: color 0.13s;
}
.card-title-link:hover { color: var(--accent); }

.card-summary {
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-groups {
  font-size: 0.75rem;
  color: var(--muted);
}

.action-list { list-style: none; display: flex; flex-direction: column; gap: 0.2rem; }
.action-item {
  display: flex;
  gap: 0.4rem;
  font-size: 0.76rem;
  color: var(--muted);
  line-height: 1.4;
}
.action-arrow { color: var(--accent); flex-shrink: 0; font-weight: 700; }

.card-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.55rem;
  border-top: 1px solid rgba(148,163,184,0.1);
  flex-wrap: wrap;
  margin-top: auto;
}
.card-date { font-size: 0.7rem; color: var(--muted); }
.card-links { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-left: auto; }

.file-link, .source-link {
  font-size: 0.7rem;
  font-weight: 500;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  text-decoration: none;
  transition: background 0.13s, color 0.13s;
  border: 1px solid;
}
.file-link {
  background: rgba(99,102,241,0.12);
  border-color: rgba(99,102,241,0.25);
  color: var(--accent);
}
.file-link:hover { background: rgba(99,102,241,0.22); }
.source-link {
  background: rgba(148,163,184,0.08);
  border-color: var(--border);
  color: var(--foreground);
}
.source-link:hover { background: rgba(99,102,241,0.16); color: var(--accent); }

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
#empty-message { font-size: 1rem; font-weight: 500; color: var(--muted); }
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
}
`;
