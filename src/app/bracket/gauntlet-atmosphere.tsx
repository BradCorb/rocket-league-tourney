"use client";

import { useEffect } from "react";

/** Mounts full-viewport Gauntlet styling on <html> for this route only (visual only). */
export function GauntletAtmosphere() {
  useEffect(() => {
    document.documentElement.classList.add("gauntlet-mode");
    return () => document.documentElement.classList.remove("gauntlet-mode");
  }, []);
  return null;
}
