import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-session";
import { getSuper4State, saveSuper4Pick } from "@/lib/super4";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const state = await getSuper4State(session.displayName);
  const me = state.leaderboard.find(
    (row) => row.displayName.toLowerCase() === session.displayName.toLowerCase(),
  );
  const myPicksByFixture = new Map(state.myPicks.map((pick) => [pick.fixtureId, pick]));
  return NextResponse.json({
    displayName: session.displayName,
    points: me?.points ?? 0,
    exact: me?.exact ?? 0,
    correctResult: me?.correctResult ?? 0,
    activeRound: state.activeRound,
    locked: state.locked,
    revealPredictions: state.revealPredictions,
    leaderboard: state.leaderboard,
    fixtures: state.fixtures,
    pendingFixtures: state.fixtures
      .filter((fixture) => fixture.homeGoals === null || fixture.awayGoals === null)
      .map((fixture) => ({
        id: fixture.id,
        round: fixture.round,
        home: fixture.home,
        away: fixture.away,
        currentPick: myPicksByFixture.get(fixture.id) ?? null,
      })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    fixtureId?: string;
    homeGoals?: number;
    awayGoals?: number;
  };
  const fixtureId = (body.fixtureId ?? "").trim();
  const homeGoals = Number(body.homeGoals);
  const awayGoals = Number(body.awayGoals);
  if (!fixtureId || !Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0) {
    return NextResponse.json({ error: "Invalid pick payload." }, { status: 400 });
  }
  const saved = await saveSuper4Pick(session.displayName, fixtureId, homeGoals, awayGoals);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
