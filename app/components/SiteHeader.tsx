import Link from "next/link";
import ThemeToggle from "@/app/components/ThemeToggle";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="DIU Notice Tracker home">
        <span className="brand-mark" aria-hidden="true">D</span>
        <span>DIU<span className="brand-light">Board</span></span>
      </Link>
      <nav className="site-links" aria-label="Primary navigation">
        <Link href="/dashboard">Notices</Link>
        <Link href="/routine">Class routine</Link>
        <Link href="/classrooms">Classrooms</Link>
        {/* <Link href="/routine/manage">Manage routines</Link> */}
      </nav>
      <ThemeToggle />
    </header>
  );
}
