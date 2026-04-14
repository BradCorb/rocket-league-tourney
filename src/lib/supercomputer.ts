import type { Fixture, Participant } from "@prisma/client";
import { computeLeagueTable } from "@/lib/tournament";

type SimRow = {
  points: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type FixturePrediction = {
  fixtureId: string;
  homeWin: number;
  draw: number;
  awayWin: number;
};

export type TableProjection = {
  participantId: string;
  titleChance: number;
  top3Chance: number;
  avgFinish: number;
};

type TeamStrength = {
  participantId: string;
  rating: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isCompleted(fixture: Fixture) {
  return fixture.homeGoals !== null && fixture.awayGoals !== null;
}

export function getMaxVisibleRound(fixtures: Fixture[]) {
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const leagueRounds = [...new Set(leagueFixtures.map((fixture) => fixture.round))].sort((a, b) => a - b);
  const firstLockedRound =
    leagueRounds.find((round) =>
      leagueFixtures
        .filter((fixture) => fixture.round === round)
        .some((fixture) => fixture.homeGoals === null || fixture.awayGoals === null),
    ) ?? null;
  return firstLockedRound ?? (leagueRounds.length > 0 ? leagueRounds[leagueRounds.length - 1] : 0);
}

export function getVisibleLeagueFixtures(fixtures: Fixture[]) {
  const maxVisibleRound = getMaxVisibleRound(fixtures);
  return fixtures.filter(
    (fixture) => fixture.phase === "LEAGUE" && fixture.round <= maxVisibleRound,
  );
}

function buildStrengths(participants: Participant[], fixtures: Fixture[]): Map<string, TeamStrength> {
  const completed = fixtures.filter(isCompleted);
  const baseTable = computeLeagueTable(participants, completed);
  const byId = new Map<string, TeamStrength>();
  const defaultRating = 0;

  for (const row of baseTable) {
    const played = Math.max(row.played, 1);
    const ppg = row.points / played;
    const gdPerGame = row.goalDifference / played;
    const rating = ppg * 0.85 + gdPerGame * 0.18;
    byId.set(row.participantId, { participantId: row.participantId, rating });
  }

  for (const participant of participants) {
    if (!byId.has(participant.id)) {
      byId.set(participant.id, { participantId: participant.id, rating: defaultRating });
    }
  }

  return byId;
}

function winDrawLossProbabilities(homeRating: number, awayRating: number) {
  const edge = homeRating - awayRating + 0.16;
  const draw = clamp(0.18 + Math.exp(-Math.abs(edge) * 1.35) * 0.16, 0.12, 0.34);
  const decisive = 1 - draw;
  const homeWin = decisive * (1 / (1 + Math.exp(-edge * 1.35)));
  const awayWin = 1 - draw - homeWin;
  return { homeWin, draw, awayWin };
}

function seedFromData(fixtures: Fixture[]) {
  const source = fixtures
    .map((fixture) => `${fixture.id}:${fixture.homeGoals ?? "x"}:${fixture.awayGoals ?? "x"}:${fixture.overtimeWinner ?? "n"}`)
    .join("|");
  return hashSeed(source);
}

function sortProjectedRows(rows: Array<{ participantId: string; points: number; goalDifference: number; goalsFor: number }>) {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.participantId.localeCompare(b.participantId);
  });
}

export function runSupercomputer(
  participants: Participant[],
  fixtures: Fixture[],
  iterations = 10000,
): {
  maxVisibleRound: number;
  fixturePredictions: FixturePrediction[];
  tableProjections: TableProjection[];
} {
  const visibleLeagueFixtures = getVisibleLeagueFixtures(fixtures);
  const completed = visibleLeagueFixtures.filter(isCompleted);
  const pending = visibleLeagueFixtures.filter((fixture) => !isCompleted(fixture));
  const strengths = buildStrengths(participants, visibleLeagueFixtures);

  const fixturePredictions = pending.map((fixture) => {
    const homeStrength = strengths.get(fixture.homeParticipantId)?.rating ?? 0;
    const awayStrength = strengths.get(fixture.awayParticipantId)?.rating ?? 0;
    const probabilities = winDrawLossProbabilities(homeStrength, awayStrength);
    return {
      fixtureId: fixture.id,
      homeWin: probabilities.homeWin,
      draw: probabilities.draw,
      awayWin: probabilities.awayWin,
    };
  });

  const resultCounters = new Map<string, { title: number; top3: number; finishTotal: number }>();
  for (const participant of participants) {
    resultCounters.set(participant.id, { title: 0, top3: 0, finishTotal: 0 });
  }

  const baseRows = new Map<string, SimRow>();
  for (const participant of participants) {
    baseRows.set(participant.id, { points: 0, goalsFor: 0, goalsAgainst: 0 });
  }

  for (const fixture of completed) {
    const home = baseRows.get(fixture.homeParticipantId);
    const away = baseRows.get(fixture.awayParticipantId);
    if (!home || !away || fixture.homeGoals === null || fixture.awayGoals === null) continue;
    home.goalsFor += fixture.homeGoals;
    home.goalsAgainst += fixture.awayGoals;
    away.goalsFor += fixture.awayGoals;
    away.goalsAgainst += fixture.homeGoals;

    if (fixture.resultKind === "DOUBLE_FORFEIT") continue;
    if (fixture.homeGoals > fixture.awayGoals) {
      if (fixture.overtimeWinner === "HOME") {
        home.points += 2;
        away.points += 1;
      } else {
        home.points += 3;
      }
    } else if (fixture.homeGoals < fixture.awayGoals) {
      if (fixture.overtimeWinner === "AWAY") {
        away.points += 2;
        home.points += 1;
      } else {
        away.points += 3;
      }
    } else {
      home.points += 1;
      away.points += 1;
    }
  }

  const rand = mulberry32(seedFromData(visibleLeagueFixtures));
  for (let run = 0; run < iterations; run += 1) {
    const rows = new Map<string, SimRow>();
    for (const [participantId, base] of baseRows.entries()) {
      rows.set(participantId, { ...base });
    }

    for (let index = 0; index < pending.length; index += 1) {
      const fixture = pending[index];
      const prediction = fixturePredictions[index];
      const roll = rand();
      const home = rows.get(fixture.homeParticipantId);
      const away = rows.get(fixture.awayParticipantId);
      if (!home || !away) continue;

      if (roll < prediction.homeWin) {
        home.points += 3;
        home.goalsFor += 2;
        home.goalsAgainst += 1;
        away.goalsFor += 1;
        away.goalsAgainst += 2;
      } else if (roll < prediction.homeWin + prediction.draw) {
        home.points += 1;
        away.points += 1;
        home.goalsFor += 1;
        home.goalsAgainst += 1;
        away.goalsFor += 1;
        away.goalsAgainst += 1;
      } else {
        away.points += 3;
        home.goalsFor += 1;
        home.goalsAgainst += 2;
        away.goalsFor += 2;
        away.goalsAgainst += 1;
      }
    }

    const projected = sortProjectedRows(
      [...rows.entries()].map(([participantId, row]) => ({
        participantId,
        points: row.points,
        goalDifference: row.goalsFor - row.goalsAgainst,
        goalsFor: row.goalsFor,
      })),
    );

    projected.forEach((row, index) => {
      const tracker = resultCounters.get(row.participantId);
      if (!tracker) return;
      if (index === 0) tracker.title += 1;
      if (index < 3) tracker.top3 += 1;
      tracker.finishTotal += index + 1;
    });
  }

  const tableProjections: TableProjection[] = participants
    .map((participant) => {
      const tracker = resultCounters.get(participant.id);
      const safeTracker = tracker ?? { title: 0, top3: 0, finishTotal: iterations * participants.length };
      return {
        participantId: participant.id,
        titleChance: safeTracker.title / iterations,
        top3Chance: safeTracker.top3 / iterations,
        avgFinish: safeTracker.finishTotal / iterations,
      };
    })
    .sort((a, b) => b.titleChance - a.titleChance || a.avgFinish - b.avgFinish);

  return {
    maxVisibleRound: getMaxVisibleRound(fixtures),
    fixturePredictions,
    tableProjections,
  };
}
