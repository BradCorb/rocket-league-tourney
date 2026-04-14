import crypto from "node:crypto";
import { cookies } from "next/headers";

type Super4Pick = {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
};

type PicksPayload = {
  displayName: string;
  picks: Super4Pick[];
};

function picksCookieName(displayName: string) {
  const normalized = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `rl_super4_${normalized}`;
}

function getSecret() {
  return process.env.SESSION_SECRET ?? "local-dev-only-secret-change-me";
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

function encode(payload: PicksPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(raw: string): PicksPayload | null {
  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PicksPayload;
    if (!parsed || typeof parsed.displayName !== "string" || !Array.isArray(parsed.picks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSuper4Picks(displayName: string) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(picksCookieName(displayName))?.value;
  if (!raw) return [];
  const payload = decode(raw);
  if (!payload || payload.displayName.toLowerCase() !== displayName.toLowerCase()) return [];
  return payload.picks;
}

export async function setSuper4Picks(displayName: string, picks: Super4Pick[]) {
  const cookieStore = await cookies();
  cookieStore.set(picksCookieName(displayName), encode({ displayName, picks }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
