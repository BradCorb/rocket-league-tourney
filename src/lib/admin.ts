import { decodeSession, type SessionPayload, SESSION_COOKIE } from "@/lib/auth-session";
import { getDisplayName } from "@/lib/display-name";

const ADMIN_DISPLAY_NAME = "Brad";

export function isAdminDisplayName(name: string | null | undefined) {
  if (!name) return false;
  const normalized = getDisplayName(name).trim().toLowerCase();
  return normalized === ADMIN_DISPLAY_NAME.toLowerCase();
}

function parseCookieValue(cookieHeader: string | null, cookieName: string) {
  if (!cookieHeader) return null;
  const segments = cookieHeader.split(";").map((entry) => entry.trim());
  for (const segment of segments) {
    const [name, ...rest] = segment.split("=");
    if (name !== cookieName) continue;
    return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function getSessionFromRequest(request: Request): SessionPayload | null {
  const raw = parseCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!raw) return null;
  return decodeSession(raw);
}

export function isAdminAuthorized(request: Request): boolean {
  const session = getSessionFromRequest(request);
  return isAdminDisplayName(session?.displayName);
}
