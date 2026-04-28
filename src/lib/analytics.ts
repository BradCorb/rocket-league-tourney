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
  const leagueFixtures = getLeagueFixtures(fixtures);
  const pending = leagueFixtures
    .filter((fixture) => fixture.status !== "COMPLETED")
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  if (pending.length === 0) return null;

  const completedLeague = getCompletedFixtures(leagueFixtures);
  const table = computeLeagueTable(participants, completedLeague);
  const rankById = new Map(table.map((row, index) => [row.participantId, index + 1]));
  const pointsById = new Map(table.map((row) => [row.participantId, row.points]));
  const totalTeams = participants.length;
  const bottomBandStart = Math.max(1, totalTeams - 2);
  const scoreFixture = (fixture: Fixture) => {
    const homeRank = rankById.get(fixture.homeParticipantId) ?? totalTeams;
    const awayRank = rankById.get(fixture.awayParticipantId) ?? totalTeams;
    const homePoints = pointsById.get(fixture.homeParticipantId) ?? 0;
    const awayPoints = pointsById.get(fixture.awayParticipantId) ?? 0;
    const rankDiff = Math.abs(homeRank - awayRank);
    const pointsDiff = Math.abs(homePoints - awayPoints);
    const betterRank = Math.min(homeRank, awayRank);
    const worseRank = Math.max(homeRank, awayRank);

    const isTitleClash = betterRank <= 2 && worseRank <= 4;
    const isTopRace = betterRank <= 4 && worseRank <= 6;
    const isRelegationClash = betterRank >= bottomBandStart && worseRank >= bottomBandStart;
    const isTopVsBottom = betterRank <= 2 && worseRank >= bottomBandStart;

    // Higher = more interesting. Prioritise table-impact fixtures, then closeness.
    let score = 0;
    if (isTitleClash) score += 140;
    else if (isTopRace) score += 90;
    if (isRelegationClash) score += 105;
    if (isTopVsBottom) score += 55;

    // Derbies in the table (close rank + close points) feel like "must watch".
    score += Math.max(0, 36 - rankDiff * 8);
    score += Math.max(0, 28 - pointsDiff * 4);

    // Slightly prefer fixtures involving the leader.
    if (homeRank === 1 || awayRank === 1) score += 14;

    const tag = isTitleClash
      ? "Title Clash"
      : isRelegationClash
        ? "Relegation Six-Pointer"
        : isTopRace
          ? "Top-Race Showdown"
          : isTopVsBottom
            ? "Top vs Bottom"
            : rankDiff <= 1 && pointsDiff <= 2
              ? "Points-Pressure Match"
              : "Featured Fixture";

    return { score, tag };
  };

  const featured = [...pending].sort((a, b) => {
    const scoreA = scoreFixture(a).score;
    const scoreB = scoreFixture(b).score;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity);
  })[0];

  if (!featured) return null;
  const featuredMeta = scoreFixture(featured);
  return {
    fixture: featured,
    home: byId.get(featured.homeParticipantId),
    away: byId.get(featured.awayParticipantId),
    spotlightTag: featuredMeta.tag,
    spotlightScore: featuredMeta.score,
  };
}
