import { FixturePhase, FixtureStatus, TournamentStatus, type Fixture } from "@prisma/client";
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
      name: "Rocket League Tournament",
      status: TournamentStatus.LEAGUE,
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
  const leagueFixtures = fixtures.filter((f) => f.phase === FixturePhase.LEAGUE);
  const allLeaguePlayed = leagueFixtures.length > 0 && leagueFixtures.every((f) => f.homeGoals !== null && f.awayGoals !== null);
  if (!allLeaguePlayed || participants.length < 4) {
    return { created: false };
  }

  const standings = computeLeagueTable(participants, leagueFixtures);
  const third = standings[2];
  const fourth = standings[3];
  const second = standings[1];
  const first = standings[0];

  if (!third || !fourth || !second || !first) {
    return { created: false };
  }

  const knockoutFixtures = fixtures.filter((f) => f.phase === FixturePhase.KNOCKOUT);
  if (knockoutFixtures.length === 0) {
    await prisma.fixture.create({
      data: {
        tournamentId: tournament.id,
        phase: FixturePhase.KNOCKOUT,
        round: 1,
        homeParticipantId: third.participantId,
        awayParticipantId: fourth.participantId,
        status: FixtureStatus.SCHEDULED,
      },
    });
    await prisma.fixture.create({
      data: {
        tournamentId: tournament.id,
        phase: FixturePhase.KNOCKOUT,
        round: 2,
        homeParticipantId: second.participantId,
        awayParticipantId: third.participantId,
        status: FixtureStatus.SCHEDULED,
      },
    });
    await prisma.fixture.create({
      data: {
        tournamentId: tournament.id,
        phase: FixturePhase.KNOCKOUT,
        round: 3,
        homeParticipantId: first.participantId,
        awayParticipantId: second.participantId,
        status: FixtureStatus.SCHEDULED,
      },
    });
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: TournamentStatus.KNOCKOUT },
    });
    return { created: true };
  }

  return { created: false };
}

export async function updateKnockoutProgression(lastEditedFixture: Fixture) {
  const prisma = getPrisma();
  if (lastEditedFixture.phase !== FixturePhase.KNOCKOUT) return;
  if (lastEditedFixture.homeGoals === null || lastEditedFixture.awayGoals === null) return;
  if (lastEditedFixture.homeGoals === lastEditedFixture.awayGoals) return;

  const winnerId =
    lastEditedFixture.homeGoals > lastEditedFixture.awayGoals
      ? lastEditedFixture.homeParticipantId
      : lastEditedFixture.awayParticipantId;

  const tournament = await getOrCreateTournament();
  if (lastEditedFixture.round === 1) {
    const semi = await prisma.fixture.findFirst({
      where: {
        tournamentId: tournament.id,
        phase: FixturePhase.KNOCKOUT,
        round: 2,
      },
    });
    if (semi) {
      await prisma.fixture.update({
        where: { id: semi.id },
        data: { awayParticipantId: winnerId },
      });
    }
  }

  if (lastEditedFixture.round === 2) {
    const final = await prisma.fixture.findFirst({
      where: {
        tournamentId: tournament.id,
        phase: FixturePhase.KNOCKOUT,
        round: 3,
      },
    });
    if (final) {
      await prisma.fixture.update({
        where: { id: final.id },
        data: { awayParticipantId: winnerId },
      });
    }
  }

  if (lastEditedFixture.round === 3) {
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: TournamentStatus.COMPLETE },
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
    data: { status: TournamentStatus.LEAGUE },
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
  const existingLeague = fixtures.filter((f) => f.phase === FixturePhase.LEAGUE);
  if (existingLeague.length > 0) {
    return { created: 0 };
  }
  const generated = generateDoubleRoundRobinFixtures(participants);
  if (generated.length === 0) {
    return { created: 0 };
  }
  await prisma.fixture.createMany({
    data: generated.map((fixture) => ({
      tournamentId: tournament.id,
      ...fixture,
    })),
  });
  return { created: generated.length };
}
