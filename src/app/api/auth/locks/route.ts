import { NextResponse } from "next/server";
import { getAllLockStates } from "@/lib/login-guard";
import { getParticipantLoginNames } from "@/lib/participant-auth";
import { isAdminAuthorized } from "@/lib/admin";

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const names = getParticipantLoginNames();
  return NextResponse.json(getAllLockStates(names));
}
