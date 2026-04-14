import { NextResponse } from "next/server";
import { getAllLockStates } from "@/lib/login-guard";
import { getParticipantLoginNames } from "@/lib/participant-auth";

export async function GET() {
  const names = getParticipantLoginNames();
  return NextResponse.json(getAllLockStates(names));
}
