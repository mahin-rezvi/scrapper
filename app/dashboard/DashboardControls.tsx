"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

interface DashboardControlsProps {
  lastRunLabel: string;
}

export function DashboardControls({ lastRunLabel }: DashboardControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [router, startTransition]);

  function refreshNow() {
    startTransition(() => router.refresh());
  }

  return (
    <section id="dashboard-controls" aria-label="Dashboard controls">
      <div id="refresh-panel">
        <span id="live-dot" aria-hidden="true" />
        <div>
          <p id="refresh-title">
            Live dashboard
          </p>
          <p id="refresh-copy">
            Auto-refreshes every minute. Last run: {lastRunLabel}.
          </p>
        </div>
        <button
          type="button"
          className="control-button"
          onClick={refreshNow}
          disabled={isPending}
        >
          {isPending ? "Refreshing" : "Refresh"}
        </button>
      </div>
    </section>
  );
}