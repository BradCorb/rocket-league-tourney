"use client";

import Link from "next/link";
import { useState } from "react";

type HeaderAuthControlsProps = {
  isAuthenticated: boolean;
  displayName?: string;
};

export function HeaderAuthControls({ isAuthenticated, displayName }: HeaderAuthControlsProps) {
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    // Hard navigate so server-rendered header state always resets immediately.
    window.location.href = "/login";
  }

  if (!isAuthenticated) {
    return (
      <Link href="/login" className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold">
        Login
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/super4" className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold">
        {displayName}
      </Link>
      <button
        type="button"
        className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold"
        onClick={() => void onLogout()}
        disabled={busy}
      >
        {busy ? "Logging out..." : "Logout"}
      </button>
    </div>
  );
}
