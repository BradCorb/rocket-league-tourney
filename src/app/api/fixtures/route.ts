import { NextResponse } from "next/server";
import { getTournamentDataReadOnly } from "@/lib/data";
import { getMaxVisibleRound } from "@/lib/supercomputer";
import { isFixtureLive } from "@/lib/fixture-state";

export async function GET() {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const byId = new Map(participants.map((p) => [p.id, p]));
  const maxVisibleRound = getMaxVisibleRound(fixtures);
  const visibleFixtures = fixtures.filter(
    (fixture) => fixture.phase !== "LEAGUE" || fixture.round <= maxVisibleRound,
  );
  const payload = visibleFixtures.map((fixture) => ({
    id: fixture.id,
    phase: fixture.phase,
    round: fixture.round,
    home: byId.get(fixture.homeParticipantId)?.displayName ?? "TBD",
    away: byId.get(fixture.awayParticipantId)?.displayName ?? "TBD",
    homePrimaryColor: byId.get(fixture.homeParticipantId)?.primaryColor ?? "#00E5FF",
    homeSecondaryColor: byId.get(fixture.homeParticipantId)?.secondaryColor ?? "#7A5CFF",
    awayPrimaryColor: byId.get(fixture.awayParticipantId)?.primaryColor ?? "#00E5FF",
    awaySecondaryColor: byId.get(fixture.awayParticipantId)?.secondaryColor ?? "#7A5CFF",
    homeStadium: byId.get(fixture.homeParticipantId)?.homeStadium ?? "",
    awayStadium: byId.get(fixture.awayParticipantId)?.homeStadium ?? "",
    homeGoals: fixture.homeGoals,
    awayGoals: fixture.awayGoals,
    overtimeWinner: fixture.overtimeWinner,
    resultKind: fixture.resultKind,
    dueAt: fixture.dueAt,
    playedAt: fixture.playedAt,
    status: fixture.status,
    live: isFixtureLive(fixture),
  }));

  return NextResponse.json(payload);
}
