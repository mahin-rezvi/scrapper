"use client";

import { useState, useTransition } from "react";

interface NotificationAssistantProps {
  department?: string;
}

interface ReplyResult {
  answer: string;
  model: string;
  query: string;
  department?: string;
  notices: Array<{ id: string; title: string; departmentCode: string; departmentName: string; publishedAt: string | null; summary: string | null; category: string | null; priority: string | null; deadline: string | null }>;
}

export function NotificationAssistant({ department }: NotificationAssistantProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ReplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError("Please ask a question about the notices.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/notifications/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmedQuery,
            department: department || undefined,
            limit: 6,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? "Failed to get an answer from the assistant.");
          return;
        }

        setResult(data as ReplyResult);
      } catch (err) {
        setError(String(err ?? "Unknown error"));
      }
    });
  }

  return (
    <div id="assistant-float">
      {open && (
        <section id="assistant-panel" aria-label="Notice assistant">
          <div id="assistant-header">
            <div>
              <p id="assistant-label">Ask the notice assistant</p>
              <p id="assistant-copy">
                Ask about recent processed notices{department ? ` in ${department.toUpperCase()}` : ""}.
              </p>
            </div>
            <button
              type="button"
              id="assistant-close"
              onClick={() => setOpen(false)}
              aria-label="Close assistant panel"
            >
              ✕
            </button>
          </div>

          <form id="assistant-form" onSubmit={handleSubmit}>
            <textarea
                id="assistant-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="e.g. What are the upcoming exam deadlines?"
                rows={4}
                disabled={isPending}
              />

            <div id="assistant-actions">
              <button type="submit" className="control-button" disabled={isPending}>
                {isPending ? "Asking…" : "Ask assistant"}
              </button>
            </div>
          </form>

          {error && <p id="assistant-error">{error}</p>}

          {result && (
            <div id="assistant-response">
              <div id="assistant-response-header">
                <h3>Assistant answer</h3>
                <span>Model: {result.model}</span>
              </div>
              <p>{result.answer}</p>
              <div id="assistant-response-notices">
                <h4>Notices used</h4>
                <ul>
                  {result.notices.map((notice) => (
                    <li key={notice.id}>
                      <strong>{notice.title}</strong>
                      <span>
                        {notice.departmentCode.toUpperCase()} · {notice.category ?? "uncategorized"} · {notice.priority ?? "unknown"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}

      <button
        type="button"
        id="assistant-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        {open ? "Close assistant" : "Ask notice assistant"}
      </button>
    </div>
  );
}
