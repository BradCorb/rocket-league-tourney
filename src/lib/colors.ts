const DEFAULT_PRIMARY = "#00E5FF";
const DEFAULT_SECONDARY = "#7A5CFF";

export function normalizeHexColor(input: string | undefined, fallback: string): string {
  if (!input) return fallback;
  const value = input.trim();
  const withHash = value.startsWith("#") ? value : `#${value}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toUpperCase();
  return fallback;
}

export function getTeamColors(primaryColor?: string, secondaryColor?: string) {
  return {
    primary: normalizeHexColor(primaryColor, DEFAULT_PRIMARY),
    secondary: normalizeHexColor(secondaryColor, DEFAULT_SECONDARY),
  };
}

export const colorDefaults = {
  primary: DEFAULT_PRIMARY,
  secondary: DEFAULT_SECONDARY,
};
