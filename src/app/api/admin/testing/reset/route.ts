import { NextResponse } from "next/server";
import { resetGamblingAndChatForTesting } from "@/lib/gambling";
import { isAdminAuthorized } from "@/lib/admin";

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await resetGamblingAndChatForTesting();
  return NextResponse.json({ ok: true });
}
