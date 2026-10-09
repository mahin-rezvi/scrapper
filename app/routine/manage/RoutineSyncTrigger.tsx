"use client";

import { useState } from "react";

type SyncResponse = {
  message?: string;
  error?: string;
  routinesAdded?: number;
  status?: string;
};

export default function RoutineSyncTrigger() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);

  async function triggerSync() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/routines/sync", {
        method: "POST",
      });
      const body = (await response.json()) as SyncResponse;
      if (!response.ok) throw new Error(body.error ?? "Routine sync failed.");
      setResult(body);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Routine sync failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sync-trigger">
      <div className="sync-trigger-copy">
        <span className="eyebrow">Manual update</span>
        <h2>Check for the latest PDFs</h2>
        <p>Refreshes department notices, then reads and publishes a routine PDF only if that department&apos;s latest notice is a class timetable.</p>
      </div>
      <div className="sync-trigger-form">
        <div className="sync-key-row">
          <button type="button" className="button button-primary" onClick={triggerSync} disabled={busy}>
            {busy ? "Checking…" : "Fetch and analyze"}
          </button>
        </div>
        {result?.message ? <p className="sync-result success">{result.message}</p> : null}
        {result?.error ? <p className="sync-result error">{result.error}</p> : null}
      </div>
    </div>
  );
}
