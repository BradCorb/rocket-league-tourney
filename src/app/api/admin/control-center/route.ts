import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { getTournamentDataReadOnly } from "@/lib/data";
import { getParticipantLoginNames } from "@/lib/participant-auth";

type AccountRow = {
  participant_name: string;
  balance: number;
  reward_start_round: number;
  last_rewarded_round: number;
};

type BetRow = {
  id: string;
  participant_name: string;
  round: number;
  stake: number;
  selections: string;
  odds: number;
  status: "OPEN" | "WON" | "LOST";
  return_points: number | null;
  created_at: Date;
  settled_at: Date | null;
};

type ChatRow = {
  id: string;
  participant_name: string;
  message: string;
  created_at: Date;
};

type PresenceRow = {
  participant_name: string;
  last_seen: Date;
};

type Super4Row = {
  participant_name: string;
  fixture_id: string;
  predicted_home: number;
  predicted_away: number;
  updated_at: Date;
};

async function ensureAdminTables() {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS gambling_accounts (
      participant_name TEXT PRIMARY KEY,
      balance INT NOT NULL,
      reward_start_round INT NOT NULL,
      last_rewarded_round INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS gambling_bets (
      id BIGSERIAL PRIMARY KEY,
      participant_name TEXT NOT NULL,
      round INT NOT NULL,
      stake INT NOT NULL CHECK (stake > 0),
      selections TEXT NOT NULL,
      odds NUMERIC(10, 4) NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      return_points INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      settled_at TIMESTAMPTZ
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      participant_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS chat_presence (
      participant_name TEXT PRIMARY KEY,
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
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

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureAdminTables();
  const prisma = getPrisma();
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const loginNames = getParticipantLoginNames();
  const participantByName = new Map(participants.map((participant) => [participant.displayName.toLowerCase(), participant]));
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));

  const [accounts, bets, chatMessages, chatPresence, super4Picks] = await Promise.all([
    prisma.$queryRaw<AccountRow[]>`
      SELECT participant_name, balance, reward_start_round, last_rewarded_round
      FROM gambling_accounts
      ORDER BY balance DESC, participant_name ASC
    `,
    prisma.$queryRaw<BetRow[]>`
      SELECT id::text AS id, participant_name, round, stake, selections, odds, status, return_points, created_at, settled_at
      FROM gambling_bets
      ORDER BY created_at DESC
      LIMIT 300
    `,
    prisma.$queryRaw<ChatRow[]>`
      SELECT id::text AS id, participant_name, message, created_at
      FROM chat_messages
      ORDER BY created_at DESC
      LIMIT 200
    `,
    prisma.$queryRaw<PresenceRow[]>`
      SELECT participant_name, last_seen
      FROM chat_presence
      ORDER BY participant_name ASC
    `,
    prisma.$queryRaw<Super4Row[]>`
      SELECT participant_name, fixture_id, predicted_home, predicted_away, updated_at
      FROM super4_picks
      ORDER BY updated_at DESC
      LIMIT 400
    `,
  ]);

  const openBets = bets.filter((bet) => bet.status === "OPEN");
  const settledBets = bets.filter((bet) => bet.status !== "OPEN");
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const super4ByUser = new Map<string, number>();
  for (const row of super4Picks) {
    super4ByUser.set(row.participant_name.toLowerCase(), (super4ByUser.get(row.participant_name.toLowerCase()) ?? 0) + 1);
  }
  const presenceByUser = new Map(chatPresence.map((row) => [row.participant_name.toLowerCase(), row.last_seen]));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    gambling: {
      accounts: loginNames.map((name) => {
        const account = accounts.find((entry) => entry.participant_name.toLowerCase() === name.toLowerCase());
        const participant = participantByName.get(name.toLowerCase());
        return {
          displayName: name,
          primaryColor: participant?.primaryColor,
          secondaryColor: participant?.secondaryColor,
          balance: account?.balance ?? 0,
          rewardStartRound: account?.reward_start_round ?? null,
          lastRewardedRound: account?.last_rewarded_round ?? null,
          openBets: openBets.filter((entry) => entry.participant_name.toLowerCase() === name.toLowerCase()).length,
          settledBets: settledBets.filter((entry) => entry.participant_name.toLowerCase() === name.toLowerCase()).length,
        };
      }),
      openBets: openBets.map((bet) => ({
        id: bet.id,
        displayName: bet.participant_name,
        round: bet.round,
        stake: bet.stake,
        odds: Number(bet.odds),
        selections: bet.selections,
        createdAt: bet.created_at.toISOString(),
      })),
      settledBets: settledBets.slice(0, 120).map((bet) => ({
        id: bet.id,
        displayName: bet.participant_name,
        round: bet.round,
        stake: bet.stake,
        odds: Number(bet.odds),
        status: bet.status,
        returnPoints: bet.return_points ?? 0,
        settledAt: bet.settled_at?.toISOString() ?? null,
      })),
    },
    chat: {
      messages: chatMessages.map((row) => ({
        id: row.id,
        displayName: row.participant_name,
        message: row.message,
        createdAt: row.created_at.toISOString(),
      })),
      presence: loginNames.map((name) => {
        const participant = participantByName.get(name.toLowerCase());
        const lastSeen = presenceByUser.get(name.toLowerCase()) ?? null;
        return {
          displayName: name,
          primaryColor: participant?.primaryColor,
          secondaryColor: participant?.secondaryColor,
          lastSeen: lastSeen ? lastSeen.toISOString() : null,
          online: lastSeen ? Date.now() - new Date(lastSeen).getTime() <= 60_000 : false,
        };
      }),
    },
    super4: {
      picksByUser: loginNames.map((name) => {
        const participant = participantByName.get(name.toLowerCase());
        return {
          displayName: name,
          primaryColor: participant?.primaryColor,
          secondaryColor: participant?.secondaryColor,
          pickCount: super4ByUser.get(name.toLowerCase()) ?? 0,
        };
      }),
      recentPicks: super4Picks.slice(0, 200).map((row) => {
        const fixture = fixtureById.get(row.fixture_id);
        const home = fixture ? participantById.get(fixture.homeParticipantId)?.displayName ?? "Home" : "Home";
        const away = fixture ? participantById.get(fixture.awayParticipantId)?.displayName ?? "Away" : "Away";
        return {
          displayName: row.participant_name,
          fixtureId: row.fixture_id,
          fixtureLabel: fixture ? `${home} vs ${away}` : row.fixture_id,
          predictedHome: row.predicted_home,
          predictedAway: row.predicted_away,
          updatedAt: row.updated_at.toISOString(),
        };
      }),
    },
  });
}
