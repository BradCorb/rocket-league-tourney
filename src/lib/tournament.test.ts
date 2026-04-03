import { describe, expect, it } from "vitest";
import type { Fixture, Participant } from "@prisma/client";
import { buildGauntletBracket, computeLeagueTable, generateDoubleRoundRobinFixtures } from "@/lib/tournament";

function participant(id: string, displayName: string): Participant {
  return {
    id,
    displayName,
    homeStadium: `${displayName} Arena`,
    primaryColor: "#00E5FF",
    secondaryColor: "#7A5CFF",
    tournamentId: "t1",
    createdAt: new Date(),
  };
}

describe("generateDoubleRoundRobinFixtures", () => {
  it("creates home and away fixtures for each pair", () => {
    const players = [participant("a", "A"), participant("b", "B"), participant("c", "C")];
    const fixtures = generateDoubleRoundRobinFixtures(players);
    expect(fixtures).toHaveLength(6);

    const aVsB = fixtures.filter(
      (fixture) =>
        (fixture.homeParticipantId === "a" && fixture.awayParticipantId === "b") ||
        (fixture.homeParticipantId === "b" && fixture.awayParticipantId === "a"),
    );
    expect(aVsB).toHaveLength(2);
  });

  it("supports up to 20 participants with correct total fixtures", () => {
    const players = Array.from({ length: 20 }, (_, i) => participant(`${i + 1}`, `P${i + 1}`));
    const fixtures = generateDoubleRoundRobinFixtures(players);
    expect(fixtures).toHaveLength(20 * 19);
    const roundSet = new Set(fixtures.map((fixture) => fixture.round));
    expect(roundSet.size).toBe(38);
  });

  it("handles odd participant counts using bye weeks", () => {
    const players = Array.from({ length: 9 }, (_, i) => participant(`${i + 1}`, `P${i + 1}`));
    const fixtures = generateDoubleRoundRobinFixtures(players);
    expect(fixtures).toHaveLength(9 * 8);
    const roundSet = [...new Set(fixtures.map((fixture) => fixture.round))];
    expect(roundSet.length).toBe(18);
    const roundOneMatches = fixtures.filter((fixture) => fixture.round === 1);
    expect(roundOneMatches.length).toBe(4);
  });
});

describe("computeLeagueTable", () => {
  it("calculates points, goals and ordering", () => {
    const players = [participant("a", "A"), participant("b", "B"), participant("c", "C"), participant("d", "D")];
    const table = computeLeagueTable(players, [
      { homeParticipantId: "a", awayParticipantId: "b", homeGoals: 2, awayGoals: 0 },
      { homeParticipantId: "c", awayParticipantId: "d", homeGoals: 1, awayGoals: 1 },
      { homeParticipantId: "a", awayParticipantId: "c", homeGoals: 0, awayGoals: 1 },
      { homeParticipantId: "b", awayParticipantId: "d", homeGoals: 3, awayGoals: 2 },
    ]);

    expect(table[0].team).toBe("C");
    expect(table[0].points).toBe(4);
    expect(table.find((row) => row.team === "A")?.goalsFor).toBe(2);
    expect(table.find((row) => row.team === "D")?.losses).toBe(1);
  });

  it("applies double forfeit as two losses with zero points and −20 goal swing each", () => {
    const players = [participant("a", "A"), participant("b", "B")];
    const table = computeLeagueTable(players, [
      {
        homeParticipantId: "a",
        awayParticipantId: "b",
        homeGoals: 0,
        awayGoals: 0,
        resultKind: "DOUBLE_FORFEIT",
      },
    ]);
    const rowA = table.find((row) => row.team === "A");
    const rowB = table.find((row) => row.team === "B");
    expect(rowA?.points).toBe(0);
    expect(rowB?.points).toBe(0);
    expect(rowA?.goalsAgainst).toBe(20);
    expect(rowB?.goalsAgainst).toBe(20);
    expect(rowA?.losses).toBe(1);
    expect(rowB?.losses).toBe(1);
  });
});

describe("buildGauntletBracket", () => {
  it("maps standings to gauntlet structure and winners", () => {
    const players = [
      participant("a", "A"),
      participant("b", "B"),
      participant("c", "C"),
      participant("d", "D"),
    ];
    const standings = [
      { participantId: "a", team: "A", stadium: "", primaryColor: "#00E5FF", secondaryColor: "#7A5CFF", played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 10 },
      { participantId: "b", team: "B", stadium: "", primaryColor: "#00E5FF", secondaryColor: "#7A5CFF", played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 8 },
      { participantId: "c", team: "C", stadium: "", primaryColor: "#00E5FF", secondaryColor: "#7A5CFF", played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 6 },
      { participantId: "d", team: "D", stadium: "", primaryColor: "#00E5FF", secondaryColor: "#7A5CFF", played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 4 },
    ];
    const fixtures: Fixture[] = [
      {
        id: "k1",
        tournamentId: "t1",
        phase: "KNOCKOUT",
        round: 1,
        homeParticipantId: "c",
        awayParticipantId: "d",
        homeGoals: 4,
        awayGoals: 2,
        overtimeWinner: null,
        resultKind: "NORMAL",
        dueAt: null,
        playedAt: new Date(),
        status: "COMPLETED",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const bracket = buildGauntletBracket(standings, players, fixtures);
    expect(bracket[0].home?.displayName).toBe("C");
    expect(bracket[0].winner?.displayName).toBe("C");
    expect(bracket[1].away?.displayName).toBe("C");
    expect(bracket[2].home?.displayName).toBe("A");
  });
});
