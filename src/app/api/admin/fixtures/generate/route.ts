import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin";
import { generateLeagueFixtures } from "@/lib/data";

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateLeagueFixtures();
  return NextResponse.json(result);
}
