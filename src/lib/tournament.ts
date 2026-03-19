import type { Fixture, Participant } from "@prisma/client";

type FixturePhase = "LEAGUE" | "KNOCKOUT";
type FixtureStatus = "SCHEDULED" | "COMPLETED";

export type TableRow = {
  participantId: string;
  team: string;
  stadium: string;
  primaryColor: string;
  secondaryColor: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

type MatchLite = Pick<Fixture, "homeParticipantId" | "awayParticipantId" | "homeGoals" | "awayGoals">;

type PairStats = {
  points: number;
  goalDifference: number;
  goalsFor: number;
};

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export function generateDoubleRoundRobinFixtures(participants: Participant[]): {
  phase: FixturePhase;
  round: number;
  homeParticipantId: string;
  awayParticipantId: string;
  status: FixtureStatus;
}[] {
  const fixtures: {
    phase: FixturePhase;
    round: number;
    homeParticipantId: string;
    awayParticipantId: string;
    status: FixtureStatus;
  }[] = [];

  let round = 1;
  for (let i = 0; i < participants.length; i += 1) {
    for (let j = i + 1; j < participants.length; j += 1) {
      fixtures.push({
        phase: "LEAGUE",
        round,
        homeParticipantId: participants[i].id,
        awayParticipantId: participants[j].id,
        status: "SCHEDULED",
      });
      round += 1;
      fixtures.push({
        phase: "LEAGUE",
        round,
        homeParticipantId: participants[j].id,
        awayParticipantId: participants[i].id,
        status: "SCHEDULED",
      });
      round += 1;
    }
  }

  return fixtures;
}

export function computeLeagueTable(
  participants: Participant[],
  leagueFixtures: MatchLite[],
): TableRow[] {
  const table = new Map<string, TableRow>();
  const headToHeadMap = new Map<string, Map<string, PairStats>>();

  for (const participant of participants) {
    table.set(participant.id, {
      participantId: participant.id,
      team: participant.displayName,
      stadium: participant.homeStadium,
      primaryColor: participant.primaryColor,
      secondaryColor: participant.secondaryColor,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  }

  const ensurePair = (playerAId: string, playerBId: string) => {
    const key = pairKey(playerAId, playerBId);
    if (!headToHeadMap.has(key)) {
      headToHeadMap.set(key, new Map<string, PairStats>());
    }
    const pair = headToHeadMap.get(key)!;
    if (!pair.has(playerAId)) {
      pair.set(playerAId, { points: 0, goalDifference: 0, goalsFor: 0 });
    }
    if (!pair.has(playerBId)) {
      pair.set(playerBId, { points: 0, goalDifference: 0, goalsFor: 0 });
    }
    return pair;
  };

  for (const fixture of leagueFixtures) {
    if (fixture.homeGoals === null || fixture.awayGoals === null) {
      continue;
    }

    const home = table.get(fixture.homeParticipantId);
    const away = table.get(fixture.awayParticipantId);
    if (!home || !away) {
      continue;
    }

    const pair = ensurePair(fixture.homeParticipantId, fixture.awayParticipantId);
    const homePair = pair.get(fixture.homeParticipantId)!;
    const awayPair = pair.get(fixture.awayParticipantId)!;

    home.played += 1;
    away.played += 1;
    home.goalsFor += fixture.homeGoals;
    home.goalsAgainst += fixture.awayGoals;
    away.goalsFor += fixture.awayGoals;
    away.goalsAgainst += fixture.homeGoals;

    homePair.goalsFor += fixture.homeGoals;
    homePair.goalDifference += fixture.homeGoals - fixture.awayGoals;
    awayPair.goalsFor += fixture.awayGoals;
    awayPair.goalDifference += fixture.awayGoals - fixture.homeGoals;

    if (fixture.homeGoals > fixture.awayGoals) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
      homePair.points += 3;
    } else if (fixture.homeGoals < fixture.awayGoals) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
      awayPair.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
      homePair.points += 1;
      awayPair.points += 1;
    }
  }

  for (const row of table.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  const rows = [...table.values()];
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

    const key = pairKey(a.participantId, b.participantId);
    const pair = headToHeadMap.get(key);
    if (pair) {
      const aPair = pair.get(a.participantId);
      const bPair = pair.get(b.participantId);
      if (aPair && bPair) {
        if (bPair.points !== aPair.points) return bPair.points - aPair.points;
        if (bPair.goalDifference !== aPair.goalDifference) return bPair.goalDifference - aPair.goalDifference;
        if (bPair.goalsFor !== aPair.goalsFor) return bPair.goalsFor - aPair.goalsFor;
      }
    }

    return a.team.localeCompare(b.team);
  });

  return rows;
}

export type BracketMatch = {
  round: 1 | 2 | 3;
  label: string;
  home?: Participant;
  away?: Participant;
  fixtureId?: string;
  homeGoals?: number | null;
  awayGoals?: number | null;
  winner?: Participant;
};

export function buildGauntletBracket(standings: TableRow[], participants: Participant[], knockoutFixtures: Fixture[]): BracketMatch[] {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const getWinner = (fx?: Fixture): Participant | undefined => {
    if (!fx || fx.homeGoals === null || fx.awayGoals === null) return undefined;
    if (fx.homeGoals === fx.awayGoals) return undefined;
    return byId.get(fx.homeGoals > fx.awayGoals ? fx.homeParticipantId : fx.awayParticipantId);
  };

  const third = standings[2] ? byId.get(standings[2].participantId) : undefined;
  const fourth = standings[3] ? byId.get(standings[3].participantId) : undefined;
  const second = standings[1] ? byId.get(standings[1].participantId) : undefined;
  const first = standings[0] ? byId.get(standings[0].participantId) : undefined;

  const match1 = knockoutFixtures.find((f) => f.round === 1);
  const match2 = knockoutFixtures.find((f) => f.round === 2);
  const final = knockoutFixtures.find((f) => f.round === 3);

  const winner1 = getWinner(match1);
  const winner2 = getWinner(match2);

  return [
    {
      round: 1,
      label: "Qualifier",
      home: match1 ? byId.get(match1.homeParticipantId) : third,
      away: match1 ? byId.get(match1.awayParticipantId) : fourth,
      fixtureId: match1?.id,
      homeGoals: match1?.homeGoals,
      awayGoals: match1?.awayGoals,
      winner: winner1,
    },
    {
      round: 2,
      label: "Semi Final",
      home: match2 ? byId.get(match2.homeParticipantId) : second,
      away: match2 ? byId.get(match2.awayParticipantId) : winner1,
      fixtureId: match2?.id,
      homeGoals: match2?.homeGoals,
      awayGoals: match2?.awayGoals,
      winner: winner2,
    },
    {
      round: 3,
      label: "Final",
      home: final ? byId.get(final.homeParticipantId) : first,
      away: final ? byId.get(final.awayParticipantId) : winner2,
      fixtureId: final?.id,
      homeGoals: final?.homeGoals,
      awayGoals: final?.awayGoals,
      winner: getWinner(final),
    },
  ];
}
