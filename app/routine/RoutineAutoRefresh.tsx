"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ROUTINE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function RoutineAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let lastRefreshAt = Date.now();
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAt < ROUTINE_REFRESH_INTERVAL_MS) return;
      lastRefreshAt = Date.now();
      router.refresh();
    };

    const interval = window.setInterval(refreshIfStale, 30_000);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [router]);

  return null;
}
