import { useEffect, useState } from "react";
import {
  optionalNonNegativeIntDisplay,
  parseOptionalNonNegativeInt,
} from "@/lib/optional-int-input";

/**
 * String-backed non-negative integer input, re-synced when `syncedValue` / `syncToken` change
 * (e.g. after API refresh). `syncToken` should change whenever the server-backed row identity or
 * saved values change; omit user keystrokes from it.
 */
export function useSyncedOptionalNonNegativeInt(
  syncedValue: number | null | undefined,
  syncToken: string | number,
) {
  const [raw, setRaw] = useState(() => optionalNonNegativeIntDisplay(syncedValue));

  useEffect(() => {
    setRaw(optionalNonNegativeIntDisplay(syncedValue));
  }, [syncToken, syncedValue]);

  const parsed = parseOptionalNonNegativeInt(raw);

  return { raw, setRaw, parsed, isValid: parsed !== null };
}
