import type { Fixture, Participant } from "@prisma/client";
import { computeLeagueTable } from "@/lib/tournament";

type ResultLetter = "W" | "D" | "L" | "WF" | "LF" | "DF";

export function getLeagueFixtures(fixtures: Fixture[]) {
  return fixtures.filter((fixture) => fixture.phase === "LEAGUE");
}

export function getKnockoutFixtures(fixtures: Fixture[]) {
  return fixtures.filter((fixture) => fixture.phase === "KNOCKOUT");
}

export function getCompletedFixtures(fixtures: Fixture[]) {
  return fixtures.filter(
    (fixture) => fixture.status === "COMPLETED" && fixture.homeGoals !== null && fixture.awayGoals !== null,
  );
}

export function getRecentForm(
  participantId: string,
  fixtures: Fixture[],
  limit = 5,
): ResultLetter[] {
  const completed = getCompletedFixtures(getLeagueFixtures(fixtures))
    .filter(
      (fixture) =>
        fixture.homeParticipantId === participantId || fixture.awayParticipantId === participantId,
    )
    .sort(
      (a, b) =>
        (a.playedAt ?? a.createdAt).getTime() - (b.playedAt ?? b.createdAt).getTime(),
    );

  return completed.slice(-limit).map((fixture) => {
    const resultKind = fixture.resultKind ?? "NORMAL";
    const isHome = fixture.homeParticipantId === participantId;
    if (resultKind === "DOUBLE_FORFEIT") return "DF";
    if (resultKind === "HOME_WALKOVER") return isHome ? "WF" : "LF";
    if (resultKind === "AWAY_WALKOVER") return isHome ? "LF" : "WF";
    // OT outcomes should appear as draws in form, same as table display.
    if (fixture.overtimeWinner === "HOME" || fixture.overtimeWinner === "AWAY") return "D";
    if ((fixture.homeGoals ?? 0) === (fixture.awayGoals ?? 0)) return "D";
    if (isHome) return (fixture.homeGoals ?? 0) > (fixture.awayGoals ?? 0) ? "W" : "L";
    return (fixture.awayGoals ?? 0) > (fixture.homeGoals ?? 0) ? "W" : "L";
  });
}

export function buildRacePanels(participants: Participant[], fixtures: Fixture[]) {
  const table = computeLeagueTable(participants, getLeagueFixtures(fixtures));
  const titleRace = table.slice(0, 3);
  const gauntletZone = table.slice(-3);
  const bestAttack = [...table].sort((a, b) => b.goalsFor - a.goalsFor)[0];
  const bestDefence = [...table].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];
  return {
    titleRace,
    gauntletZone,
    bestAttack,
    bestDefence,
  };
}

export function findFeaturedFixture(participants: Participant[], fixtures: Fixture[]) {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const pending = getLeagueFixtures(fixtures)
    .filter((fixture) => fixture.status !== "COMPLETED")
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  const featured = pending[0];
  if (!featured) return null;
  return {
    fixture: featured,
    home: byId.get(featured.homeParticipantId),
    away: byId.get(featured.awayParticipantId),
  };
}
