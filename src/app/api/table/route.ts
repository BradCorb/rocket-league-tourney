import { NextResponse } from "next/server";
import { FixturePhase } from "@prisma/client";
import { getTournamentData } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";

export async function GET() {
  const { participants, fixtures } = await getTournamentData();
  const league = fixtures.filter((fixture) => fixture.phase === FixturePhase.LEAGUE);
  const table = computeLeagueTable(participants, league);
  return NextResponse.json(table);
}
