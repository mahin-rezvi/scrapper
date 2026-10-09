import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { homeSnapshot } from "@/lib/db/notices";

export const metadata: Metadata = {
  title: "DIUBoard — Your campus, in sync",
  description: "Search DIU class routines and official university notices in one fast, student-friendly place.",
};

export const dynamic = "force-dynamic";

const tools = [
  {
    number: "01",
    title: "Find a class, fast",
    description: "Look up your section, teacher, course, or room in the recognized class timetable.",
    href: "/routine",
    action: "Search class routines",
  },
  {
    number: "02",
    title: "Stay ahead of campus updates",
    description: "Search official department notices by keyword, category, and department.",
    href: "/dashboard",
    action: "Explore notices",
  },
];

function formatDhakaDate(value: string | null) {
  if (!value) return "No sync recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No sync recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  }).format(date);
}

export default async function HomePage() {
  let overview: Awaited<ReturnType<typeof homeSnapshot>> | null = null;
  try {
    overview = await homeSnapshot();
  } catch (error) {
    console.error("DIUBoard home overview unavailable:", error);
  }

  return (
    <main className="landing-page">
      <div className="landing-wrap">
        <SiteHeader />
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="live-label"><span /> Made for everyday DIU life</div>
            <h1>Campus life,<br /><em>less scattered.</em></h1>
            <p className="hero-intro">
              Find your next class and keep up with official university announcements from one calm, searchable home.
            </p>
            <form action="/routine" method="get" className="hero-routine-search" aria-label="Quick section search">
              <label>
                <span>Department</span>
                <input name="department" aria-label="Department code" defaultValue="cse" placeholder="CSE" maxLength={64} />
              </label>
              <label>
                <span>Your section</span>
                <input name="section" aria-label="Section code" placeholder="e.g. 64_I" maxLength={32} />
              </label>
              <input type="hidden" name="searchType" value="section" />
              <button className="button button-primary" type="submit">Find my classes <span aria-hidden="true">↗</span></button>
            </form>
            <div className="hero-links">
              <Link href="/routine">Browse all routines <span aria-hidden="true">→</span></Link>
              <Link href="/dashboard">Search notices <span aria-hidden="true">→</span></Link>
            </div>
            <div className="hero-note"><span aria-hidden="true">✦</span> Linked to official department notices and source PDFs</div>
          </div>
          <div className="hero-art" aria-label="DIUBoard features">
            <div className="art-glow" />
            <div className="home-dashboard-card">
              <div className="home-card-top">
                <span className="home-card-logo">D</span>
                <div><b>Your campus dashboard</b><span>Schedules and notices, together</span></div>
                <span className="home-card-status"><i /> Ready</span>
              </div>
              <Link href="/routine" className="home-card-tool">
                <span className="home-tool-icon">◷</span>
                <span><b>Class routine</b><small>{overview ? `${overview.routines} departments with recognized timetables` : "Search official timetable PDFs"}</small></span>
                <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/dashboard" className="home-card-tool">
                <span className="home-tool-icon home-tool-icon-blue">▤</span>
                <span><b>Official notices</b><small>Search updates from across DIU</small></span>
                <span aria-hidden="true">↗</span>
              </Link>
              <div className="home-card-footer">NO ACCOUNT NEEDED <span>·</span> SOURCE-LINKED</div>
            </div>
            <div className="floating-tag"><span>↗</span> Search before you scroll</div>
          </div>
        </section>

        <section className="landing-metrics" aria-label="Current DIUBoard data">
          {overview ? (
            <>
              <div className="metric-card"><b>{overview.departments.toLocaleString()}</b><span>Departments tracked</span></div>
              <div className="metric-card"><b>{overview.notices.toLocaleString()}</b><span>Official notices indexed</span></div>
              <div className="metric-card"><b>{overview.routines.toLocaleString()}</b><span>Departments with class routines</span></div>
              <div className="metric-card metric-sync"><span>Last notice sync</span><b>{formatDhakaDate(overview.lastSyncedAt)}</b><small>{overview.syncStatus ? `Status: ${overview.syncStatus}` : "Waiting for first sync"}</small></div>
            </>
          ) : (
            <p className="overview-unavailable">The live overview is temporarily unavailable. You can still search the site.</p>
          )}
        </section>

        <section className="landing-tools" aria-label="DIUBoard tools">
          <div className="tools-heading">
            <div><span className="eyebrow">Useful from the first tap</span><h2>What do you need today?</h2></div>
            <span className="tools-count">01 — 02</span>
          </div>
          <div className="feature-grid">
            {tools.map((tool) => (
              <Link href={tool.href} className="feature-card" key={tool.number}>
                <span className="feature-number">{tool.number}</span>
                <div><h3>{tool.title}</h3><p>{tool.description}</p></div>
                <span className="feature-action">{tool.action}<span aria-hidden="true">↗</span></span>
              </Link>
            ))}
          </div>
        </section>
        <footer className="landing-footer"><span>DIUBoard</span><span>Less searching. More doing.</span><span>DAFFODIL INTERNATIONAL UNIVERSITY</span></footer>
      </div>
    </main>
  );
}
