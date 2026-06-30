"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a server-rendered operator board live: re-runs the server component's
 * data fetch on an interval (and when the tab regains focus) without a full
 * page reload, so new orders and status changes surface on their own.
 */
export function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => router.refresh();
    const id = setInterval(tick, intervalMs);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [router, intervalMs]);
  return null;
}
