import { NextResponse } from "next/server";
import { getTournamentDataReadOnly } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";

export async function GET() {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const league = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const table = computeLeagueTable(participants, league);
  return NextResponse.json(table);
}
