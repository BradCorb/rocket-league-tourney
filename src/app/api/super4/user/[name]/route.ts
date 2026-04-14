import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-session";
import { getUserRoundPredictions } from "@/lib/super4";

type RouteContext = {
  params: Promise<{ name: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await context.params;
  const name = decodeURIComponent(params.name);
  const result = await getUserRoundPredictions(name, session.displayName);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}
