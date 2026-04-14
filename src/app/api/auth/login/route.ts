import { NextResponse } from "next/server";
import { clearFailedAttempts, getLockInfo, recordFailedAttempt } from "@/lib/login-guard";
import { getParticipantLoginNames, verifyParticipantPassword } from "@/lib/participant-auth";
import { setSession } from "@/lib/auth-session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string;
    password?: string;
    remember?: boolean;
  };
  const displayName = (body.displayName ?? "").trim();
  const password = body.password ?? "";
  const remember = body.remember !== false;

  if (!displayName || !password) {
    return NextResponse.json({ error: "Name and password are required." }, { status: 400 });
  }
  if (!getParticipantLoginNames().some((name) => name.toLowerCase() === displayName.toLowerCase())) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const lock = getLockInfo(displayName);
  if (lock.locked) {
    return NextResponse.json(
      { error: `Locked. Try again in ${Math.ceil(lock.lockRemainingMs / 1000)} seconds.` },
      { status: 429 },
    );
  }

  const valid = verifyParticipantPassword(displayName, password);
  if (!valid) {
    recordFailedAttempt(displayName);
    const nowLock = getLockInfo(displayName);
    return NextResponse.json(
      {
        error: nowLock.locked
          ? "Too many failed attempts. Locked for 5 minutes."
          : `Invalid password. ${nowLock.attemptsLeft} attempt(s) left.`,
      },
      { status: 401 },
    );
  }

  clearFailedAttempts(displayName);
  await setSession(displayName, remember);
  return NextResponse.json({ ok: true, displayName });
}
