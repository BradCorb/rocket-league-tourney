import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-session";
import { getGamblingState } from "@/lib/gambling";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const state = await getGamblingState(session.displayName);
  return NextResponse.json(state);
}
