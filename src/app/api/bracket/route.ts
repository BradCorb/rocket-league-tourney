import { NextResponse } from "next/server";
import { getTournamentDataReadOnly } from "@/lib/data";
import { buildGauntletBracket, computeLeagueTable } from "@/lib/tournament";

export async function GET() {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const knockoutFixtures = fixtures.filter((fixture) => fixture.phase === "KNOCKOUT");
  const standings = computeLeagueTable(participants, leagueFixtures);
  const bracket = buildGauntletBracket(standings, participants, knockoutFixtures);
  return NextResponse.json(bracket);
}
