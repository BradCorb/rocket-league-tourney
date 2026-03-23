import type { Fixture } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { computeLeagueTable, generateDoubleRoundRobinFixtures } from "@/lib/tournament";
import { normalizeHexColor } from "@/lib/colors";

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
}

export async function ensureKnockoutFixtures() {
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
    const dueInDays = (days: number) => new Date(now + days * 24 * 60 * 60 * 1000);
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
          dueAt: dueInDays(round * 7),
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
    await prisma.fixture.update({
      where: { id: nextRound.id },
      data: { awayParticipantId: winnerId },
    });
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
  const dueInDays = (days: number) => new Date(now + days * 24 * 60 * 60 * 1000);
  await prisma.fixture.createMany({
    data: generated.map((fixture) => ({
      tournamentId: tournament.id,
      ...fixture,
      dueAt: dueInDays(fixture.round * 7),
    })),
  });
  return { created: generated.length };
}
