"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light";
const STORAGE_KEY = "notice-tracker-theme";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

function getThemeSnapshot(): Theme {
  if (typeof document === "undefined") return "dark";
  const currentTheme = document.documentElement.dataset.theme;
  if (currentTheme === "dark" || currentTheme === "light") {
    return currentTheme;
  }
  return getPreferredTheme();
}

function subscribeTheme(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("notice-tracker-theme-change", listener);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("notice-tracker-theme-change", listener);
  };
}

function notifyThemeChange() {
  window.dispatchEvent(new Event("notice-tracker-theme-change"));
}

function persistTheme(theme: Theme) {
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    () => "dark"
  );

  useEffect(() => {
    const nextTheme = getPreferredTheme();
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    notifyThemeChange();
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    notifyThemeChange();
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-pressed={theme === "light"}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
