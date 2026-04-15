const DISPLAY_NAME_ALIASES: Record<string, string> = {
  "dan atkin": "Akazz",
};

export function getDisplayName(name: string) {
  return DISPLAY_NAME_ALIASES[name.trim().toLowerCase()] ?? name;
}
