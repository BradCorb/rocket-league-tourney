import { NextResponse } from "next/server";
import { FixturePhase } from "@prisma/client";
import { getTournamentData } from "@/lib/data";
import { buildGauntletBracket, computeLeagueTable } from "@/lib/tournament";

export async function GET() {
  const { participants, fixtures } = await getTournamentData();
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === FixturePhase.LEAGUE);
  const knockoutFixtures = fixtures.filter((fixture) => fixture.phase === FixturePhase.KNOCKOUT);
  const standings = computeLeagueTable(participants, leagueFixtures);
  const bracket = buildGauntletBracket(standings, participants, knockoutFixtures);
  return NextResponse.json(bracket);
}
