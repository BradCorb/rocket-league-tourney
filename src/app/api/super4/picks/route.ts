import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-session";
import { getTournamentDataReadOnly } from "@/lib/data";
import { getVisibleLeagueFixtures } from "@/lib/supercomputer";
import { getSuper4Picks, setSuper4Picks } from "@/lib/super4-picks";

function isPendingFixture(homeGoals: number | null, awayGoals: number | null) {
  return homeGoals === null || awayGoals === null;
}

function resultValue(homeGoals: number, awayGoals: number) {
  if (homeGoals > awayGoals) return 1;
  if (homeGoals < awayGoals) return -1;
  return 0;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { participants, fixtures } = await getTournamentDataReadOnly();
  const visibleLeague = getVisibleLeagueFixtures(fixtures);
  const pending = visibleLeague.filter((fixture) => isPendingFixture(fixture.homeGoals, fixture.awayGoals));
  const picks = await getSuper4Picks(session.displayName);
  const picksByFixture = new Map(picks.map((pick) => [pick.fixtureId, pick]));
  const byId = new Map(participants.map((participant) => [participant.id, participant]));

  const completedWithPicks = visibleLeague.filter(
    (fixture) =>
      fixture.homeGoals !== null && fixture.awayGoals !== null && picksByFixture.has(fixture.id),
  );
  const points = completedWithPicks.reduce((sum, fixture) => {
    const pick = picksByFixture.get(fixture.id);
    if (!pick || fixture.homeGoals === null || fixture.awayGoals === null) return sum;
    if (pick.homeGoals === fixture.homeGoals && pick.awayGoals === fixture.awayGoals) return sum + 5;
    return resultValue(pick.homeGoals, pick.awayGoals) === resultValue(fixture.homeGoals, fixture.awayGoals)
      ? sum + 2
      : sum;
  }, 0);

  return NextResponse.json({
    displayName: session.displayName,
    points,
    pendingFixtures: pending.map((fixture) => ({
      id: fixture.id,
      round: fixture.round,
      home: byId.get(fixture.homeParticipantId)?.displayName ?? "Home",
      away: byId.get(fixture.awayParticipantId)?.displayName ?? "Away",
      currentPick: picksByFixture.get(fixture.id) ?? null,
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

  const { fixtures } = await getTournamentDataReadOnly();
  const visibleLeague = getVisibleLeagueFixtures(fixtures);
  const target = visibleLeague.find((fixture) => fixture.id === fixtureId);
  if (!target) return NextResponse.json({ error: "Fixture not available for picks." }, { status: 404 });
  if (!isPendingFixture(target.homeGoals, target.awayGoals)) {
    return NextResponse.json({ error: "Fixture already completed." }, { status: 409 });
  }

  const existing = await getSuper4Picks(session.displayName);
  const next = [...existing.filter((pick) => pick.fixtureId !== fixtureId), { fixtureId, homeGoals, awayGoals }];
  await setSuper4Picks(session.displayName, next);

  return NextResponse.json({ ok: true });
}
