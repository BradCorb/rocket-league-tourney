import { NextResponse } from "next/server";
import { resetGamblingAndChatForTesting } from "@/lib/gambling";

export async function POST() {
  await resetGamblingAndChatForTesting();
  return NextResponse.json({ ok: true });
}
