import type { Fixture } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getTournamentDataReadOnly } from "@/lib/data";
import { getVisibleLeagueFixtures } from "@/lib/supercomputer";
import { getParticipantLoginNames } from "@/lib/participant-auth";
import { getDisplayNameKey } from "@/lib/display-name";

type DbPick = {
  participant_name: string;
  fixture_id: string;
  predicted_home: number;
  predicted_away: number;
};

export type Super4Fixture = {
  id: string;
  round: number;
  home: string;
  away: string;
  homePrimaryColor?: string;
  homeSecondaryColor?: string;
  awayPrimaryColor?: string;
  awaySecondaryColor?: string;
  homeGoals: number | null;
  awayGoals: number | null;
  resultKind?: "NORMAL" | "DOUBLE_FORFEIT" | "HOME_WALKOVER" | "AWAY_WALKOVER" | null;
};

export type Super4UserRow = {
  displayName: string;
  primaryColor?: string;
  secondaryColor?: string;
  points: number;
  exact: number;
  correctResult: number;
};

export type Super4State = {
  competition: "LEAGUE" | "KNOCKOUT";
  activeRound: number | null;
  locked: boolean;
  revealPredictions: boolean;
  fixtures: Super4Fixture[];
  myPicks: Array<{ fixtureId: string; homeGoals: number; awayGoals: number }>;
  leaderboard: Super4UserRow[];
};

function isCompleted(fixture: { homeGoals: number | null; awayGoals: number | null }) {
  return fixture.homeGoals !== null && fixture.awayGoals !== null;
}

function fixtureResult(homeGoals: number, awayGoals: number) {
  if (homeGoals > awayGoals) return 1;
  if (homeGoals < awayGoals) return -1;
  return 0;
}

function scorePick(
  pick: { homeGoals: number; awayGoals: number },
  actual: { homeGoals: number; awayGoals: number },
) {
  if (pick.homeGoals === actual.homeGoals && pick.awayGoals === actual.awayGoals) return { points: 5, exact: 1, correctResult: 0 };
  if (fixtureResult(pick.homeGoals, pick.awayGoals) === fixtureResult(actual.homeGoals, actual.awayGoals)) {
    return { points: 2, exact: 0, correctResult: 1 };
  }
  return { points: 0, exact: 0, correctResult: 0 };
}

async function ensureTable() {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS super4_picks (
      id BIGSERIAL PRIMARY KEY,
      participant_name TEXT NOT NULL,
      fixture_id TEXT NOT NULL,
      predicted_home INT NOT NULL CHECK (predicted_home >= 0),
      predicted_away INT NOT NULL CHECK (predicted_away >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (participant_name, fixture_id)
    );
  `);
}

async function getAllPicks() {
  await ensureTable();
  const prisma = getPrisma();
  return prisma.$queryRawUnsafe<DbPick[]>(`
    SELECT participant_name, fixture_id, predicted_home, predicted_away
    FROM super4_picks
  `);
}

function getActiveRound(visibleLeagueFixtures: Fixture[]) {
  const rounds = [...new Set(visibleLeagueFixtures.map((fixture) => fixture.round))].sort((a, b) => a - b);
  if (rounds.length === 0) return null;
  return (
    rounds.find((round) =>
      visibleLeagueFixtures
        .filter((fixture) => fixture.round === round)
        .some((fixture) => !isCompleted(fixture)),
    ) ?? rounds[rounds.length - 1]
  );
}

function getActiveRoundForFixtures(fixtures: Fixture[]) {
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))].sort((a, b) => a - b);
  if (rounds.length === 0) return null;
  return (
    rounds.find((round) =>
      fixtures
        .filter((fixture) => fixture.round === round)
        .some((fixture) => !isCompleted(fixture)),
    ) ?? rounds[rounds.length - 1]
  );
}

export async function getSuper4State(currentUserName: string): Promise<Super4State> {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const loginNames = getParticipantLoginNames();
  const visibleLeagueFixtures = getVisibleLeagueFixtures(fixtures);
  const leagueActiveRound = getActiveRound(visibleLeagueFixtures);
  const leagueRoundFixtures = leagueActiveRound === null
    ? []
    : visibleLeagueFixtures.filter((fixture) => fixture.round === leagueActiveRound);
  const hasLeaguePending = leagueRoundFixtures.some((fixture) => !isCompleted(fixture));
  const knockoutFixtures = fixtures
    .filter((fixture) => fixture.phase === "KNOCKOUT")
    .sort((a, b) => (a.round !== b.round ? a.round - b.round : a.createdAt.getTime() - b.createdAt.getTime()));
  const competition = hasLeaguePending || knockoutFixtures.length === 0 ? "LEAGUE" : "KNOCKOUT";
  const activeRound = competition === "LEAGUE"
    ? leagueActiveRound
    : getActiveRoundForFixtures(knockoutFixtures);
  const roundFixtures = activeRound === null
    ? []
    : (competition === "LEAGUE" ? visibleLeagueFixtures : knockoutFixtures).filter(
        (fixture) => fixture.round === activeRound,
      );
  const locked = roundFixtures.some(isCompleted);
  const picks = await getAllPicks();
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const fixtureById = new Map(visibleLeagueFixtures.map((fixture) => [fixture.id, fixture]));
  for (const fixture of knockoutFixtures) {
    fixtureById.set(fixture.id, fixture);
  }

  const myPicks = picks
    .filter((pick) => getDisplayNameKey(pick.participant_name) === getDisplayNameKey(currentUserName))
    .map((pick) => ({ fixtureId: pick.fixture_id, homeGoals: pick.predicted_home, awayGoals: pick.predicted_away }));

  const leaderboard = loginNames.map<Super4UserRow>((displayName) => {
    const userPicks = picks.filter(
      (pick) => getDisplayNameKey(pick.participant_name) === getDisplayNameKey(displayName),
    );
    let points = 0;
    let exact = 0;
    let correctResult = 0;
    for (const pick of userPicks) {
      const fixture = fixtureById.get(pick.fixture_id);
      if (!fixture || !isCompleted(fixture)) continue;
      if ((fixture.resultKind ?? "NORMAL") !== "NORMAL") continue;
      const scored = scorePick(
        { homeGoals: pick.predicted_home, awayGoals: pick.predicted_away },
        { homeGoals: fixture.homeGoals ?? 0, awayGoals: fixture.awayGoals ?? 0 },
      );
      points += scored.points;
      exact += scored.exact;
      correctResult += scored.correctResult;
    }
    const participant = participants.find(
      (entry) => getDisplayNameKey(entry.displayName) === getDisplayNameKey(displayName),
    );
    return {
      displayName,
      primaryColor: participant?.primaryColor,
      secondaryColor: participant?.secondaryColor,
      points,
      exact,
      correctResult,
    };
  }).sort((a, b) => b.points - a.points || b.exact - a.exact || b.correctResult - a.correctResult || a.displayName.localeCompare(b.displayName));

  const fixturesForRound = roundFixtures.map<Super4Fixture>((fixture) => ({
    id: fixture.id,
    round: fixture.round,
    home: byId.get(fixture.homeParticipantId)?.displayName ?? "Home",
    away: byId.get(fixture.awayParticipantId)?.displayName ?? "Away",
    homePrimaryColor: byId.get(fixture.homeParticipantId)?.primaryColor,
    homeSecondaryColor: byId.get(fixture.homeParticipantId)?.secondaryColor,
    awayPrimaryColor: byId.get(fixture.awayParticipantId)?.primaryColor,
    awaySecondaryColor: byId.get(fixture.awayParticipantId)?.secondaryColor,
    homeGoals: fixture.homeGoals,
    awayGoals: fixture.awayGoals,
    resultKind: fixture.resultKind,
  }));

  return {
    competition,
    activeRound,
    locked,
    revealPredictions: locked,
    fixtures: fixturesForRound,
    myPicks,
    leaderboard,
  };
}

export async function saveSuper4Pick(
  currentUserName: string,
  fixtureId: string,
  homeGoals: number,
  awayGoals: number,
) {
  const state = await getSuper4State(currentUserName);
  if (state.activeRound === null) return { ok: false, error: "No active GameWeek." };
  if (state.locked) return { ok: false, error: "Predictions are locked for this GameWeek." };
  const target = state.fixtures.find((fixture) => fixture.id === fixtureId);
  if (!target) return { ok: false, error: "Fixture is not in the active GameWeek." };
  if (target.homeGoals !== null || target.awayGoals !== null) {
    return { ok: false, error: "Fixture already completed." };
  }
  await ensureTable();
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO super4_picks (participant_name, fixture_id, predicted_home, predicted_away)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (participant_name, fixture_id)
      DO UPDATE SET predicted_home = EXCLUDED.predicted_home, predicted_away = EXCLUDED.predicted_away, updated_at = NOW()
    `,
    currentUserName,
    fixtureId,
    homeGoals,
    awayGoals,
  );
  return { ok: true };
}

export async function getUserRoundPredictions(displayName: string, requesterName: string) {
  const state = await getSuper4State(requesterName);
  if (!state.revealPredictions) {
    return { ok: false as const, error: "Predictions unlock after first result in the GameWeek." };
  }
  const picks = await getAllPicks();
  const picksByFixture = new Map(
    picks
      .filter((pick) => getDisplayNameKey(pick.participant_name) === getDisplayNameKey(displayName))
      .map((pick) => [pick.fixture_id, pick]),
  );
  const predictions = state.fixtures.map((fixture) => ({
    fixtureId: fixture.id,
    round: fixture.round,
    home: fixture.home,
    away: fixture.away,
    homePrimaryColor: fixture.homePrimaryColor,
    homeSecondaryColor: fixture.homeSecondaryColor,
    awayPrimaryColor: fixture.awayPrimaryColor,
    awaySecondaryColor: fixture.awaySecondaryColor,
    predictedHome: picksByFixture.get(fixture.id)?.predicted_home ?? null,
    predictedAway: picksByFixture.get(fixture.id)?.predicted_away ?? null,
    actualHome: fixture.homeGoals,
    actualAway: fixture.awayGoals,
    resultKind: fixture.resultKind ?? "NORMAL",
  }));
  return { ok: true as const, activeRound: state.activeRound, predictions };
}
