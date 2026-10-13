"use client";

import { useEffect } from "react";

export function usePolling(refresh: () => Promise<unknown>, interval = 5000) {
  useEffect(() => {
    const run = () => { if (document.visibilityState === "visible") void refresh(); };
    const initial = window.setTimeout(run, 0);
    const timer = window.setInterval(run, interval);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", run);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", run); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", run); };
  }, [refresh, interval]);
}
