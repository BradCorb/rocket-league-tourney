/**
 * Site convention for free-typed numeric fields (scores, stakes, deltas):
 * keep **string** state for `<input type="number">` / `inputMode="numeric"`, and use these
 * parsers/formatters. Do **not** use `Number(event.target.value)` on controlled inputs — an empty
 * field becomes `0` and wipes “blank while editing”.
 */

export function optionalNonNegativeIntDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function parseOptionalNonNegativeInt(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

export function optionalIntDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

export function parseOptionalIntInRange(raw: string, min: number, max: number): number | null {
  const n = parseOptionalInt(raw);
  if (n === null) return null;
  if (n < min || n > max) return null;
  return n;
}

/** Integer stake / amount ≥ 1 */
export function parseOptionalPositiveInt(raw: string): number | null {
  const n = parseOptionalNonNegativeInt(raw);
  if (n === null) return null;
  if (n < 1) return null;
  return n;
}
