import crypto from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "rl_participant_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

type SessionPayload = {
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

function decode(raw: string): SessionPayload | null {
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
  return decode(raw);
}

export async function setSession(displayName: string) {
  const cookieStore = await cookies();
  const payload: SessionPayload = {
    displayName,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  cookieStore.set(SESSION_COOKIE, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
