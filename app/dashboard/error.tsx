"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <main className="route-loading">
      <section className="empty-panel">
        <span className="empty-icon">!</span>
        <h1 className="mb-2 text-xl font-semibold">The notice board could not load</h1>
        <p>Please try again. If this continues, check the Supabase connection and server logs.</p>
        {error.digest ? <p className="font-mono text-xs">Error ID: {error.digest}</p> : null}
        <div className="mt-5 flex justify-center gap-2">
          <button className="button button-primary" onClick={reset}>Try again</button>
          <Link className="button button-outline" href="/">Back home</Link>
        </div>
      </section>
    </main>
  );
}
