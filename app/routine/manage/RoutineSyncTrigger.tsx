"use client";

import { useState } from "react";

type SyncResponse = {
  message?: string;
  error?: string;
  routinesAdded?: number;
  status?: string;
};

export default function RoutineSyncTrigger({ enabled }: { enabled: boolean }) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);

  async function triggerSync() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/routines/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
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
        <label htmlFor="routine-admin-key">Management key</label>
        <div className="sync-key-row">
          <input
            id="routine-admin-key"
            type="password"
            autoComplete="current-password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={enabled ? "Enter management key" : "ROUTINE_SYNC_SECRET is not configured"}
            disabled={!enabled || busy}
          />
          <button type="button" className="button button-primary" onClick={triggerSync} disabled={!enabled || busy || !secret.trim()}>
            {busy ? "Checking…" : "Fetch and analyze"}
          </button>
        </div>
        {result?.message ? <p className="sync-result success">{result.message}</p> : null}
        {result?.error ? <p className="sync-result error">{result.error}</p> : null}
        {!enabled ? <p className="sync-result">Set ROUTINE_SYNC_SECRET on the server to enable manual updates.</p> : null}
      </div>
    </div>
  );
}
