"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_MS = 45_000;

/**
 * Re-fetches server data so projections pick up new results without a full page reload.
 */
export function SupercomputerLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  return (
    <p className="muted mt-2 text-xs">
      Auto-refresh every {REFRESH_MS / 1000}s after new results — model and seed update from live fixtures only.
    </p>
  );
}
