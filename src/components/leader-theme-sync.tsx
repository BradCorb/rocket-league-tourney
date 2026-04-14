"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type TableRowLite = {
  primaryColor: string;
  secondaryColor: string;
};

function normalizeHex(input: string, fallback: string) {
  const trimmed = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return fallback;
}

function applyLeaderTheme(primary: string, secondary: string) {
  const mix = primary.toLowerCase() === secondary.toLowerCase() ? primary : secondary;
  const html = document.documentElement;
  html.style.setProperty("--leader-primary", primary);
  html.style.setProperty("--leader-secondary", secondary);
  html.style.setProperty("--brand-a", primary);
  html.style.setProperty("--brand-b", secondary);
  html.style.setProperty("--brand-c", mix);
}

function clearLeaderTheme() {
  const html = document.documentElement;
  html.style.removeProperty("--leader-primary");
  html.style.removeProperty("--leader-secondary");
  html.style.removeProperty("--brand-a");
  html.style.removeProperty("--brand-b");
  html.style.removeProperty("--brand-c");
}

export function LeaderThemeSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/bracket")) {
      clearLeaderTheme();
      return;
    }

    let isMounted = true;
    const updateFromTable = async () => {
      try {
        const response = await fetch("/api/table", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as TableRowLite[];
        if (!isMounted || data.length === 0) return;
        const leader = data[0];
        const primary = normalizeHex(leader.primaryColor, "#24f2ff");
        const secondary = normalizeHex(leader.secondaryColor, "#5a6bff");
        applyLeaderTheme(primary, secondary);
      } catch {
        // ignore theme sync failures
      }
    };

    void updateFromTable();
    const interval = window.setInterval(updateFromTable, 30000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [pathname]);

  return null;
}
