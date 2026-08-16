"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

interface DashboardControlsProps {
  lastRunLabel: string;
}

export function DashboardControls({ lastRunLabel }: DashboardControlsProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPipeline() {
    setError(null);
    setIsRefreshing(true);

    try {
      const response = await fetch("/api/cron/scrape", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Pipeline request failed: ${response.status} ${body}`);
      }

      await response.json();
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Could not refresh pipeline. Check logs.");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void runPipeline();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [router]);

  function refreshNow() {
    void runPipeline();
  }

  return (
    <section aria-label="Dashboard controls" className="dashboard-controls-panel">
      <div className="dashboard-controls-status">
        <span className="dashboard-controls-dot" aria-hidden="true">
          <span className="dashboard-controls-dot-ping" />
          <span className="dashboard-controls-dot-core" />
        </span>

        <div>
          <p className="dashboard-controls-title">Live dashboard</p>
          <p className="dashboard-controls-copy">
            Auto-refreshes every minute · Last run{" "}
            <span className="dashboard-controls-meta">{lastRunLabel}</span>
          </p>
          {error ? (
            <p className="dashboard-controls-error">{error}</p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={refreshNow}
        disabled={isRefreshing}
        className="refresh-button"
      >
        <RefreshCw
          className={isRefreshing ? "animate-spin" : ""}
          aria-hidden="true"
        />
        {isRefreshing ? "Refreshing" : "Refresh"}
      </button>
    </section>
  );
}