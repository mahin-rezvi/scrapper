"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SavedSection = { department: string; section: string };
const STORAGE_KEY = "diuboard-saved-sections";

function isSavedSection(value: unknown): value is SavedSection {
  return Boolean(
    value &&
    typeof value === "object" &&
    "department" in value &&
    "section" in value &&
    typeof value.department === "string" &&
    typeof value.section === "string",
  );
}

function sectionUrl(saved: SavedSection) {
  const params = new URLSearchParams({
    department: saved.department,
    section: saved.section,
    searchType: "section",
  });
  return `/routine?${params.toString()}`;
}

export default function SavedSections({
  department,
  section,
}: {
  department: string;
  section: string;
}) {
  const [savedSections, setSavedSections] = useState<SavedSection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const normalizedSection = section.trim().toUpperCase();
  const currentSaved = savedSections.some(
    (saved) => saved.department === department && saved.section === normalizedSection,
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        if (Array.isArray(stored)) setSavedSections(stored.filter(isSavedSection).slice(0, 8));
      } catch {
        setMessage("Saved sections are unavailable in this browser.");
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function updateSavedSections(next: SavedSection[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSavedSections(next);
      setMessage("Saved sections updated on this device.");
    } catch {
      setMessage("Could not save this section in your browser.");
    }
  }

  function toggleCurrentSection() {
    if (!normalizedSection || !department) return;
    const next = currentSaved
      ? savedSections.filter((saved) => saved.department !== department || saved.section !== normalizedSection)
      : [{ department, section: normalizedSection }, ...savedSections].slice(0, 8);
    updateSavedSections(next);
  }

  return (
    <div className="saved-sections">
      <div className="saved-sections-heading">
        <div><b>Quick access</b><span>Up to 8 sections, saved only on this device</span></div>
        <button
          type="button"
          className="save-section-button"
          onClick={toggleCurrentSection}
          disabled={!loaded || !normalizedSection || !department}
          aria-pressed={currentSaved}
        >
          <span aria-hidden="true">{currentSaved ? "★" : "☆"}</span>
          {currentSaved ? "Saved section" : "Save this section"}
        </button>
      </div>
      {savedSections.length ? (
        <div className="saved-section-list" aria-label="Saved sections">
          {savedSections.map((saved) => (
            <span className="saved-section-chip" key={`${saved.department}-${saved.section}`}>
              <Link href={sectionUrl(saved)}>{saved.department.toUpperCase()} · {saved.section}</Link>
              <button
                type="button"
                onClick={() => updateSavedSections(savedSections.filter((item) => item !== saved))}
                aria-label={`Remove ${saved.department.toUpperCase()} ${saved.section}`}
              >×</button>
            </span>
          ))}
        </div>
      ) : <p className="saved-sections-empty">Search a section, then save it here for one-tap access.</p>}
      <span className="visually-hidden" role="status" aria-live="polite">{message}</span>
    </div>
  );
}
