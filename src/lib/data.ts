import type { Fixture, Participant, Tournament } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { computeLeagueTable, generateDoubleRoundRobinFixtures } from "@/lib/tournament";
import { normalizeHexColor } from "@/lib/colors";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getOrCreateTournament() {
  const prisma = getPrisma();
  const existing = await prisma.tournament.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.tournament.create({
    data: {
      name: "Bradzaz' Rocket League",
      status: "LEAGUE",
    },
  });
}

export async function getTournamentData() {
  try {
    const prisma = getPrisma();
    const tournament = await getOrCreateTournament();
    const participants = await prisma.participant.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { displayName: "asc" },
    });
    const fixtures = await prisma.fixture.findMany({
      where: { tournamentId: tournament.id },
      orderBy: [{ phase: "asc" }, { round: "asc" }, { createdAt: "asc" }],
    });
    return { tournament, participants, fixtures };
  } catch {
    return buildPreviewData();
  }
}

export async function getTournamentDataReadOnly() {
  try {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (!tournament) {
      return buildPreviewData();
    }
    const participants = await prisma.participant.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { displayName: "asc" },
    });
    const fixtures = await prisma.fixture.findMany({
      where: { tournamentId: tournament.id },
      orderBy: [{ phase: "asc" }, { round: "asc" }, { createdAt: "asc" }],
    });
    return { tournament, participants, fixtures };
  } catch {
    return buildPreviewData();
  }
}

function buildPreviewData(): {
  tournament: Tournament;
  participants: Participant[];
  fixtures: Fixture[];
} {
  const now = new Date();
  const tournament: Tournament = {
    id: "preview-tournament",
    name: "Bradzaz' Rocket League (Preview)",
    status: "KNOCKOUT",
    createdAt: now,
    updatedAt: now,
  };
  const participants: Participant[] = [
    ["p1", "Brad", "DFH Stadium", "#00E5FF", "#7A5CFF"],
    ["p2", "Akazz", "Mannfield", "#7A5CFF", "#FF4FD8"],
    ["p3", "Jacob", "Champions Field", "#FF4FD8", "#00E5FF"],
    ["p4", "JJ", "Neo Tokyo", "#20F6A9", "#3454FF"],
  ].map(([id, displayName, homeStadium, primaryColor, secondaryColor]) => ({
    id,
    displayName,
    homeStadium,
    primaryColor,
    secondaryColor,
    tournamentId: tournament.id,
    createdAt: now,
  }));
  const fixtures: Fixture[] = [
    {
      id: "f1",
      tournamentId: tournament.id,
      phase: "LEAGUE",
      round: 1,
      homeParticipantId: "p1",
      awayParticipantId: "p2",
      homeGoals: 3,
      awayGoals: 1,
      overtimeWinner: null,
      resultKind: "NORMAL",
      dueAt: now,
      playedAt: now,
      status: "COMPLETED",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "f2",
      tournamentId: tournament.id,
      phase: "LEAGUE",
      round: 1,
      homeParticipantId: "p3",
      awayParticipantId: "p4",
      homeGoals: 2,
      awayGoals: 1,
      overtimeWinner: "HOME",
      resultKind: "NORMAL",
      dueAt: now,
      playedAt: now,
      status: "COMPLETED",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "f3",
      tournamentId: tournament.id,
      phase: "LEAGUE",
      round: 2,
      homeParticipantId: "p2",
      awayParticipantId: "p3",
      homeGoals: null,
      awayGoals: null,
      overtimeWinner: null,
      resultKind: "NORMAL",
      dueAt: now,
      playedAt: null,
      status: "SCHEDULED",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "k1",
      tournamentId: tournament.id,
      phase: "KNOCKOUT",
      round: 1,
      homeParticipantId: "p3",
      awayParticipantId: "p4",
      homeGoals: 2,
      awayGoals: 0,
      overtimeWinner: null,
      resultKind: "NORMAL",
      dueAt: now,
      playedAt: now,
      status: "COMPLETED",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "k2",
      tournamentId: tournament.id,
      phase: "KNOCKOUT",
      round: 2,
      homeParticipantId: "p2",
      awayParticipantId: "p3",
      homeGoals: null,
      awayGoals: null,
      overtimeWinner: null,
      resultKind: "NORMAL",
      dueAt: now,
      playedAt: null,
      status: "SCHEDULED",
      createdAt: now,
      updatedAt: now,
    },
  ];
  return { tournament, participants, fixtures };
}

export async function ensureKnockoutFixtures() {
  try {
    const prisma = getPrisma();
    const { tournament, participants, fixtures } = await getTournamentData();
    const leagueFixtures = fixtures.filter((f) => f.phase === "LEAGUE");
    const allLeaguePlayed = leagueFixtures.length > 0 && leagueFixtures.every((f) => f.homeGoals !== null && f.awayGoals !== null);
    if (!allLeaguePlayed || participants.length < 2) {
      return { created: false };
    }

    const standings = computeLeagueTable(participants, leagueFixtures);
    if (standings.length < 2) {
      return { created: false };
    }

    const knockoutFixtures = fixtures.filter((f) => f.phase === "KNOCKOUT");
    const expectedRounds = standings.length - 1;
    const hasCompletedKnockout = knockoutFixtures.some(
      (fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null,
    );
    const shouldRebuildKnockout =
      knockoutFixtures.length > 0 &&
      knockoutFixtures.length !== expectedRounds &&
      !hasCompletedKnockout;

    if (shouldRebuildKnockout) {
      await prisma.fixture.deleteMany({
        where: { tournamentId: tournament.id, phase: "KNOCKOUT" },
      });
    }

    if (knockoutFixtures.length === 0 || shouldRebuildKnockout) {
  const now = Date.now();
  const dueInOneWeek = new Date(now + WEEK_MS);
  const rounds = expectedRounds;
      await prisma.fixture.createMany({
        data: Array.from({ length: rounds }, (_, index) => {
          const round = index + 1;
          const homeSeed = standings[standings.length - 1 - round];
          const awaySeed = standings[standings.length - round];
          return {
            tournamentId: tournament.id,
            phase: "KNOCKOUT" as const,
            round,
            homeParticipantId: homeSeed.participantId,
            awayParticipantId: awaySeed.participantId,
            dueAt: round === 1 ? dueInOneWeek : null,
            status: "SCHEDULED" as const,
          };
        }),
      });
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: "KNOCKOUT" },
      });
      return { created: true };
    }

    return { created: false };
  } catch {
    return { created: false };
  }
}

export async function syncLeagueDeadlinesFromRoundCompletion(lastEditedFixture: Fixture) {
  if (lastEditedFixture.phase !== "LEAGUE") return;
  if (lastEditedFixture.homeGoals === null || lastEditedFixture.awayGoals === null) return;

  const prisma = getPrisma();
  const roundFixtures = await prisma.fixture.findMany({
    where: {
      tournamentId: lastEditedFixture.tournamentId,
      phase: "LEAGUE",
      round: lastEditedFixture.round,
    },
    orderBy: { createdAt: "asc" },
  });
  if (roundFixtures.length === 0) return;

  const allCompleted = roundFixtures.every((fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null);
  if (!allCompleted) return;

  const completionAnchor = roundFixtures.reduce<number>((latest, fixture) => {
    const playedAt = fixture.playedAt?.getTime() ?? 0;
    return Math.max(latest, playedAt);
  }, 0);
  const baseTime = completionAnchor > 0 ? completionAnchor : Date.now();
  const nextDeadline = new Date(baseTime + WEEK_MS);

  await prisma.fixture.updateMany({
    where: {
      tournamentId: lastEditedFixture.tournamentId,
      phase: "LEAGUE",
      round: lastEditedFixture.round + 1,
      OR: [{ homeGoals: null }, { awayGoals: null }],
    },
    data: {
      dueAt: nextDeadline,
    },
  });
}

export async function updateKnockoutProgression(lastEditedFixture: Fixture) {
  const prisma = getPrisma();
  if (lastEditedFixture.phase !== "KNOCKOUT") return;
  if (lastEditedFixture.homeGoals === null || lastEditedFixture.awayGoals === null) return;
  const winnerId = (() => {
    if (lastEditedFixture.homeGoals > lastEditedFixture.awayGoals) {
      return lastEditedFixture.homeParticipantId;
    }
    if (lastEditedFixture.awayGoals > lastEditedFixture.homeGoals) {
      return lastEditedFixture.awayParticipantId;
    }
    if (lastEditedFixture.overtimeWinner === "HOME") {
      return lastEditedFixture.homeParticipantId;
    }
    if (lastEditedFixture.overtimeWinner === "AWAY") {
      return lastEditedFixture.awayParticipantId;
    }
    return null;
  })();
  if (!winnerId) return;

  const tournament = await getOrCreateTournament();
  const nextRound = await prisma.fixture.findFirst({
    where: {
      tournamentId: tournament.id,
      phase: "KNOCKOUT",
      round: lastEditedFixture.round + 1,
    },
  });

  if (nextRound) {
    const shouldResetFuture = nextRound.awayParticipantId !== winnerId;
    const dueAt = new Date(Date.now() + WEEK_MS);
    await prisma.fixture.update({
      where: { id: nextRound.id },
      data: { awayParticipantId: winnerId, dueAt },
    });
    if (shouldResetFuture) {
      await prisma.fixture.updateMany({
        where: {
          tournamentId: tournament.id,
          phase: "KNOCKOUT",
          round: { gt: lastEditedFixture.round },
        },
        data: {
          homeGoals: null,
          awayGoals: null,
          overtimeWinner: null,
          playedAt: null,
          status: "SCHEDULED",
        },
      });
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: "KNOCKOUT" },
      });
    }
    return;
  }

  if (!nextRound) {
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: "COMPLETE" },
    });
  }
}

export async function resetParticipants(
  entries: Array<{
    displayName: string;
    homeStadium: string;
    primaryColor: string;
    secondaryColor: string;
  }>,
) {
  const prisma = getPrisma();
  const tournament = await getOrCreateTournament();
  await prisma.fixture.deleteMany({
    where: { tournamentId: tournament.id },
  });
  await prisma.participant.deleteMany({
    where: { tournamentId: tournament.id },
  });
  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { status: "LEAGUE" },
  });
  await prisma.participant.createMany({
    data: entries.map((entry) => ({
      displayName: entry.displayName,
      homeStadium: entry.homeStadium,
      primaryColor: normalizeHexColor(entry.primaryColor, "#00E5FF"),
      secondaryColor: normalizeHexColor(entry.secondaryColor, "#7A5CFF"),
      tournamentId: tournament.id,
    })),
  });
}

export async function generateLeagueFixtures() {
  const prisma = getPrisma();
  const { tournament, participants, fixtures } = await getTournamentData();
  const existingLeague = fixtures.filter((f) => f.phase === "LEAGUE");
  if (existingLeague.length > 0) {
    return { created: 0 };
  }
  const generated = generateDoubleRoundRobinFixtures(participants);
  if (generated.length === 0) {
    return { created: 0 };
  }
  const now = Date.now();
  const firstWeekDeadline = new Date(now + WEEK_MS);
  await prisma.fixture.createMany({
    data: generated.map((fixture) => ({
      tournamentId: tournament.id,
      ...fixture,
      dueAt: fixture.round === 1 ? firstWeekDeadline : null,
    })),
  });
  return { created: generated.length };
}
