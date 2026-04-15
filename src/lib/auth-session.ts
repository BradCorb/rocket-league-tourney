import crypto from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "rl_participant_session";
const SESSION_TTL_PERSISTENT_MS = 1000 * 60 * 60 * 24 * 365 * 5;
const SESSION_TTL_SESSION_MS = 1000 * 60 * 60 * 12;

export type SessionPayload = {
  displayName: string;
  expiresAt: number;
};

function getSessionSecret() {
  return process.env.SESSION_SECRET ?? "local-dev-only-secret-change-me";
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

function encode(payload: SessionPayload) {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(raw: string): SessionPayload | null {
  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.displayName || typeof parsed.expiresAt !== "number") return null;
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decodeSession(raw);
}

export async function setSession(displayName: string, remember = true) {
  const cookieStore = await cookies();
  const ttl = remember ? SESSION_TTL_PERSISTENT_MS : SESSION_TTL_SESSION_MS;
  const payload: SessionPayload = {
    displayName,
    expiresAt: Date.now() + ttl,
  };
  cookieStore.set(SESSION_COOKIE, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ttl / 1000),
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
