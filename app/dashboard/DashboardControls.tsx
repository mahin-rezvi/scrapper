"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface DashboardControlsProps {
  lastRunLabel: string;
}

export function DashboardControls({ lastRunLabel }: DashboardControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [secret, setSecret] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem("notice-tracker-cron-secret") ?? "";
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [router, startTransition]);

  function refreshNow() {
    setMessage("Refreshing dashboard data...");
    startTransition(() => {
      router.refresh();
      window.setTimeout(() => setMessage(null), 1500);
    });
  }

  async function runScrape(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = secret.trim();
    if (!token) {
      setMessage("Enter the cron secret first.");
      return;
    }

    window.sessionStorage.setItem("notice-tracker-cron-secret", token);
    setIsRunning(true);
    setMessage("Running scraper. This can take a few minutes...");

    try {
      const res = await fetch("/api/cron/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      setMessage(
        `Scrape finished: ${body.totalNew ?? 0} new notice(s), ${
          body.totalErrors ?? 0
        } error(s).`
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(`Scrape failed: ${String(err)}`);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section id="dashboard-controls" aria-label="Dashboard controls">
      <div id="refresh-panel">
        <span id="live-dot" aria-hidden="true" />
        <div>
          <p id="refresh-title">Live dashboard</p>
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

      <form id="scrape-panel" onSubmit={runScrape}>
        <label htmlFor="cron-secret-input">Admin scrape</label>
        <input
          id="cron-secret-input"
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder="CRON_SECRET"
          autoComplete="off"
        />
        <button type="submit" className="control-button" disabled={isRunning}>
          {isRunning ? "Running" : "Run now"}
        </button>
      </form>

      {message && <p id="control-message">{message}</p>}
    </section>
  );
}
