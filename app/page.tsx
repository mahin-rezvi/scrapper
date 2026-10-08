import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";

const features = [
  {
    number: "01",
    title: "University notices",
    description: "Recent department updates, exam announcements, results, and important dates in one place.",
    href: "/dashboard",
    action: "Browse notices",
  },
  {
    number: "02",
    title: "Search your routine",
    description: "Find your section in the latest class timetable, with room, course, and teacher details.",
    href: "/routine",
    action: "Find a class",
  },
];

export default function HomePage() {
  return (
    <main className="landing-page">
      <div className="landing-wrap">
        <SiteHeader />
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="live-label"><span /> Built for the DIU community</div>
            <h1>Your university,<br /><em>in sync.</em></h1>
            <p className="hero-intro">
              Keep up with department notices and find your class routine without searching through scattered PDFs.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/routine">Find my routine <span aria-hidden="true">↗</span></Link>
              <Link className="button button-quiet" href="/dashboard">Explore notices <span aria-hidden="true">→</span></Link>
            </div>
            <div className="hero-note"><span aria-hidden="true">✦</span> Notices and routines gathered from official DIU boards</div>
          </div>
          <div className="hero-art" aria-label="Preview of a searchable weekly class routine">
            <div className="art-glow" />
            <div className="routine-preview">
              <div className="preview-top"><span className="preview-dot" /><span>MY WEEK</span><span className="preview-week">FALL · 2026</span></div>
              <div className="preview-day"><span>MON</span><b>64_I</b><span>3 classes</span></div>
              <div className="preview-class"><span>09:00</span><div><b>CSE 216</b><small>KT-218 · MHR</small></div><span className="class-chip">LAB</span></div>
              <div className="preview-class"><span>11:30</span><div><b>CSE 315</b><small>KT-216 · SNK</small></div><span className="class-chip lecture">LEC</span></div>
              <div className="preview-day preview-day-next"><span>WED</span><b>64_I</b><span>2 classes</span></div>
              <div className="preview-class"><span>10:00</span><div><b>CSE 228</b><small>KT-208 · MIS</small></div><span className="class-chip lecture">LEC</span></div>
              <div className="preview-foot"><span>Latest class routine</span><span>↗</span></div>
            </div>
            <div className="floating-tag"><span>↗</span> Search by section</div>
          </div>
        </section>

        <section className="landing-tools" aria-label="Available tools">
          <div className="tools-heading"><div><span className="eyebrow">One campus, less searching</span><h2>What do you need today?</h2></div><span className="tools-count">01 — 02</span></div>
          <div className="feature-grid">
            {features.map((feature) => (
              <Link href={feature.href} className="feature-card" key={feature.number}>
                <span className="feature-number">{feature.number}</span>
                <div><h3>{feature.title}</h3><p>{feature.description}</p></div>
                <span className="feature-action">{feature.action}<span aria-hidden="true">↗</span></span>
              </Link>
            ))}
          </div>
        </section>
        <footer className="landing-footer"><span>DIUBoard</span><span>Made to make campus life easier.</span><span>DAFFODIL INTERNATIONAL UNIVERSITY</span></footer>
      </div>
    </main>
  );
}
