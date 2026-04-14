import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-session";
import { placeAccumulatorBet, placeSingleBet } from "@/lib/gambling";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    type?: "SINGLE" | "ACCUM";
    fixtureId?: string;
    side?: "HOME" | "AWAY";
    selections?: Array<{ fixtureId: string; side: "HOME" | "AWAY" }>;
    stake?: number;
  };
  const stake = Number(body.stake);
  if (body.type === "SINGLE") {
    const fixtureId = (body.fixtureId ?? "").trim();
    const side = body.side;
    if (!fixtureId || (side !== "HOME" && side !== "AWAY")) {
      return NextResponse.json({ error: "Invalid single bet payload." }, { status: 400 });
    }
    const result = await placeSingleBet(session.displayName, fixtureId, side, stake);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (body.type === "ACCUM") {
    const selections = Array.isArray(body.selections) ? body.selections : [];
    const result = await placeAccumulatorBet(session.displayName, selections, stake);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown bet type." }, { status: 400 });
}
