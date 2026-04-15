import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-session";
import type { BetSide } from "@/lib/gambling";
import { cashOutBet, placeAccumulatorBet, placeSingleBet } from "@/lib/gambling";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    type?: "SINGLE" | "ACCUM" | "CASH_OUT";
    fixtureId?: string;
    side?: BetSide;
    line?: number;
    selections?: Array<{ fixtureId: string; side: BetSide; line?: number }>;
    stake?: number;
    betId?: string;
  };
  const stake = Number(body.stake);
  if (body.type === "SINGLE") {
    const fixtureId = (body.fixtureId ?? "").trim();
    const side = body.side;
    const validSide =
      side === "HOME_WIN" ||
      side === "AWAY_WIN" ||
      side === "BTTS_YES" ||
      side === "BTTS_NO" ||
      side === "MATCH_GOALS_OVER" ||
      side === "MATCH_GOALS_UNDER" ||
      side === "HOME_GOALS_OVER" ||
      side === "HOME_GOALS_UNDER" ||
      side === "AWAY_GOALS_OVER" ||
      side === "AWAY_GOALS_UNDER" ||
      side === "OVER_55" ||
      side === "UNDER_55";
    if (!fixtureId || !validSide) {
      return NextResponse.json({ error: "Invalid single bet payload." }, { status: 400 });
    }
    const result = await placeSingleBet(session.displayName, fixtureId, side, stake, Number(body.line));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (body.type === "ACCUM") {
    const selections = Array.isArray(body.selections) ? body.selections : [];
    const result = await placeAccumulatorBet(session.displayName, selections, stake);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (body.type === "CASH_OUT") {
    const betId = (body.betId ?? "").trim();
    if (!betId) return NextResponse.json({ error: "Missing bet id." }, { status: 400 });
    const result = await cashOutBet(session.displayName, betId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown bet type." }, { status: 400 });
}
