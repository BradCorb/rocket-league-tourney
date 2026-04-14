import type { Fixture } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getTournamentDataReadOnly } from "@/lib/data";
import { getParticipantLoginNames } from "@/lib/participant-auth";
import { runSupercomputer } from "@/lib/supercomputer";

type DbAccount = {
  participant_name: string;
  balance: number;
  reward_start_round: number;
  last_rewarded_round: number;
};

type DbBet = {
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

export type MarketFixture = {
  fixtureId: string;
  round: number;
  homeName: string;
  awayName: string;
  homePrimaryColor?: string;
  homeSecondaryColor?: string;
  awayPrimaryColor?: string;
  awaySecondaryColor?: string;
  homeOdds: number;
  awayOdds: number;
  locked: boolean;
};

export type GamblingState = {
  activeRound: number | null;
  balance: number;
  rewardNotice: string;
  markets: MarketFixture[];
  openBets: Array<{
    id: string;
    stake: number;
    odds: number;
    selections: Array<{ fixtureId: string; side: "HOME" | "AWAY"; label: string }>;
    createdAt: string;
  }>;
  settledBets: Array<{
    id: string;
    stake: number;
    odds: number;
    status: "WON" | "LOST";
    returnPoints: number;
    settledAt: string | null;
  }>;
  leaderboard: Array<{ displayName: string; balance: number }>;
};

type Selection = { fixtureId: string; side: "HOME" | "AWAY" };

function isCompleted(fixture: { homeGoals: number | null; awayGoals: number | null }) {
  return fixture.homeGoals !== null && fixture.awayGoals !== null;
}

function getWinner(fixture: Fixture): "HOME" | "AWAY" | null {
  if (fixture.homeGoals === null || fixture.awayGoals === null) return null;
  if (fixture.homeGoals > fixture.awayGoals) return "HOME";
  if (fixture.homeGoals < fixture.awayGoals) return "AWAY";
  if (fixture.overtimeWinner === "HOME" || fixture.overtimeWinner === "AWAY") return fixture.overtimeWinner;
  return null;
}

function parseSelections(raw: string): Selection[] {
  return raw
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [fixtureId, side] = chunk.split(":");
      if (!fixtureId || (side !== "HOME" && side !== "AWAY")) return null;
      return { fixtureId, side };
    })
    .filter((entry): entry is Selection => Boolean(entry));
}

function serializeSelections(selections: Selection[]) {
  return selections.map((selection) => `${selection.fixtureId}:${selection.side}`).join(",");
}

function toTwoWayOdds(homeWinReg: number, drawReg: number, awayWinReg: number) {
  const homeWinner = homeWinReg + drawReg * 0.5;
  const awayWinner = awayWinReg + drawReg * 0.5;
  const total = Math.max(homeWinner + awayWinner, 1e-9);
  const baseHome = homeWinner / total;
  const baseAway = awayWinner / total;
  const overround = 1.06;
  const impliedHome = Math.max(baseHome * overround, 0.03);
  const impliedAway = Math.max(baseAway * overround, 0.03);
  const homeOdds = Math.min(Math.max(1 / impliedHome, 1.05), 50);
  const awayOdds = Math.min(Math.max(1 / impliedAway, 1.05), 50);
  return { homeOdds: Number(homeOdds.toFixed(2)), awayOdds: Number(awayOdds.toFixed(2)) };
}

function getRounds(fixtures: Fixture[]) {
  return [...new Set(fixtures.filter((fixture) => fixture.phase === "LEAGUE").map((fixture) => fixture.round))].sort(
    (a, b) => a - b,
  );
}

function getActiveRound(fixtures: Fixture[]) {
  const league = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const rounds = getRounds(fixtures);
  if (rounds.length === 0) return null;
  return (
    rounds.find((round) =>
      league
        .filter((fixture) => fixture.round === round)
        .some((fixture) => !isCompleted(fixture)),
    ) ?? rounds[rounds.length - 1]
  );
}

function getLatestCompletedRound(fixtures: Fixture[]) {
  const league = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const rounds = getRounds(fixtures);
  let latest = 0;
  for (const round of rounds) {
    const roundFixtures = league.filter((fixture) => fixture.round === round);
    if (roundFixtures.length > 0 && roundFixtures.every(isCompleted)) {
      latest = round;
    } else {
      break;
    }
  }
  return latest;
}

async function ensureTables() {
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
}

async function getAccounts() {
  await ensureTables();
  const prisma = getPrisma();
  return prisma.$queryRaw<DbAccount[]>`
    SELECT participant_name, balance, reward_start_round, last_rewarded_round
    FROM gambling_accounts
  `;
}

async function getBets() {
  await ensureTables();
  const prisma = getPrisma();
  return prisma.$queryRaw<DbBet[]>`
    SELECT id::text AS id, participant_name, round, stake, selections, odds, status, return_points, created_at, settled_at
    FROM gambling_bets
    ORDER BY created_at DESC
  `;
}

async function ensureAccountsInitialized(activeRound: number | null) {
  const prisma = getPrisma();
  const names = getParticipantLoginNames();
  const roundAnchor = activeRound ?? 1;
  await ensureTables();
  for (const name of names) {
    await prisma.$executeRaw`
      INSERT INTO gambling_accounts (participant_name, balance, reward_start_round, last_rewarded_round)
      VALUES (${name}, 100, ${roundAnchor}, ${roundAnchor - 1})
      ON CONFLICT (participant_name) DO NOTHING
    `;
  }
}

async function applyWeeklyRewards(latestCompletedRound: number) {
  const prisma = getPrisma();
  const accounts = await getAccounts();
  for (const account of accounts) {
    const fromRound = Math.max(account.reward_start_round, account.last_rewarded_round + 1);
    if (latestCompletedRound < fromRound) continue;
    const roundsRewarded = latestCompletedRound - fromRound + 1;
    if (roundsRewarded <= 0) continue;
    const reward = roundsRewarded * 100;
    await prisma.$executeRaw`
      UPDATE gambling_accounts
      SET balance = balance + ${reward},
          last_rewarded_round = ${latestCompletedRound},
          updated_at = NOW()
      WHERE participant_name = ${account.participant_name}
    `;
  }
}

async function settleOpenBets(fixtures: Fixture[]) {
  const prisma = getPrisma();
  const bets = (await getBets()).filter((bet) => bet.status === "OPEN");
  const byFixture = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  for (const bet of bets) {
    const selections = parseSelections(bet.selections);
    if (selections.length === 0) continue;
    const related = selections.map((selection) => byFixture.get(selection.fixtureId)).filter((fixture): fixture is Fixture => Boolean(fixture));
    if (related.length !== selections.length) continue;
    if (!related.every(isCompleted)) continue;

    const won = selections.every((selection) => {
      const fixture = byFixture.get(selection.fixtureId);
      if (!fixture) return false;
      return getWinner(fixture) === selection.side;
    });
    const payout = won ? Math.max(0, Math.round(bet.stake * Number(bet.odds))) : 0;
    await prisma.$executeRaw`
      UPDATE gambling_bets
      SET status = ${won ? "WON" : "LOST"},
          return_points = ${payout},
          settled_at = NOW()
      WHERE id = ${BigInt(bet.id)}
    `;
    if (won && payout > 0) {
      await prisma.$executeRaw`
        UPDATE gambling_accounts
        SET balance = balance + ${payout},
            updated_at = NOW()
        WHERE participant_name = ${bet.participant_name}
      `;
    }
  }
}

export async function getGamblingState(displayName: string): Promise<GamblingState> {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const activeRound = getActiveRound(fixtures);
  await ensureAccountsInitialized(activeRound);
  await applyWeeklyRewards(getLatestCompletedRound(fixtures));
  await settleOpenBets(fixtures.filter((fixture) => fixture.phase === "LEAGUE"));

  const accounts = await getAccounts();
  const account = accounts.find((entry) => entry.participant_name.toLowerCase() === displayName.toLowerCase());
  const balance = account?.balance ?? 100;

  const activeRoundFixtures = activeRound === null
    ? []
    : fixtures.filter((fixture) => fixture.phase === "LEAGUE" && fixture.round === activeRound);
  const locked = activeRoundFixtures.some(isCompleted);
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const supercomputer = runSupercomputer(participants, fixtures, 10000);
  const predictionByFixture = new Map(
    supercomputer.fixturePredictions.map((prediction) => [prediction.fixtureId, prediction]),
  );

  const markets: MarketFixture[] = activeRoundFixtures.map((fixture) => {
    const prediction = predictionByFixture.get(fixture.id);
    const market = prediction
      ? toTwoWayOdds(prediction.homeWin, prediction.draw, prediction.awayWin)
      : { homeOdds: 2, awayOdds: 2 };
    return {
      fixtureId: fixture.id,
      round: fixture.round,
      homeName: byId.get(fixture.homeParticipantId)?.displayName ?? "Home",
      awayName: byId.get(fixture.awayParticipantId)?.displayName ?? "Away",
      homePrimaryColor: byId.get(fixture.homeParticipantId)?.primaryColor,
      homeSecondaryColor: byId.get(fixture.homeParticipantId)?.secondaryColor,
      awayPrimaryColor: byId.get(fixture.awayParticipantId)?.primaryColor,
      awaySecondaryColor: byId.get(fixture.awayParticipantId)?.secondaryColor,
      homeOdds: market.homeOdds,
      awayOdds: market.awayOdds,
      locked,
    };
  });

  const bets = (await getBets()).filter((bet) => bet.participant_name.toLowerCase() === displayName.toLowerCase());
  const openBets = bets
    .filter((bet) => bet.status === "OPEN")
    .map((bet) => ({
      id: bet.id,
      stake: bet.stake,
      odds: Number(bet.odds),
      selections: parseSelections(bet.selections).map((selection) => {
        const fixture = activeRoundFixtures.find((entry) => entry.id === selection.fixtureId);
        const home = fixture ? byId.get(fixture.homeParticipantId)?.displayName ?? "Home" : "Home";
        const away = fixture ? byId.get(fixture.awayParticipantId)?.displayName ?? "Away" : "Away";
        return {
          fixtureId: selection.fixtureId,
          side: selection.side,
          label: selection.side === "HOME" ? home : away,
        };
      }),
      createdAt: bet.created_at.toISOString(),
    }));
  const settledBets = bets
    .filter((bet) => bet.status !== "OPEN")
    .slice(0, 20)
    .map((bet) => ({
      id: bet.id,
      stake: bet.stake,
      odds: Number(bet.odds),
      status: bet.status as "WON" | "LOST",
      returnPoints: bet.return_points ?? 0,
      settledAt: bet.settled_at?.toISOString() ?? null,
    }));

  const leaderboard = accounts
    .map((entry) => ({ displayName: entry.participant_name, balance: entry.balance }))
    .sort((a, b) => b.balance - a.balance || a.displayName.localeCompare(b.displayName));

  const rewardNotice = activeRound
    ? `Each completed GameWeek from GW${account?.reward_start_round ?? activeRound} onward adds +100 points.`
    : "Rewards activate once fixtures exist.";

  return {
    activeRound,
    balance,
    rewardNotice,
    markets,
    openBets,
    settledBets,
    leaderboard,
  };
}

export async function placeSingleBet(
  displayName: string,
  fixtureId: string,
  side: "HOME" | "AWAY",
  stake: number,
) {
  return placeBet(displayName, [{ fixtureId, side }], stake);
}

export async function placeAccumulatorBet(
  displayName: string,
  selections: Selection[],
  stake: number,
) {
  if (selections.length < 2) {
    return { ok: false as const, error: "Accumulator requires at least 2 selections." };
  }
  return placeBet(displayName, selections, stake);
}

async function placeBet(displayName: string, selections: Selection[], stake: number) {
  if (!Number.isInteger(stake) || stake <= 0) return { ok: false as const, error: "Stake must be a positive whole number." };
  const state = await getGamblingState(displayName);
  if (state.activeRound === null) return { ok: false as const, error: "No active GameWeek." };
  if (state.markets.some((market) => market.locked)) {
    return { ok: false as const, error: "Betting is locked for this GameWeek." };
  }
  if (stake > state.balance) return { ok: false as const, error: "Insufficient points balance." };

  const marketById = new Map(state.markets.map((market) => [market.fixtureId, market]));
  let totalOdds = 1;
  const normalizedSelections: Selection[] = [];
  const seenFixture = new Set<string>();
  for (const selection of selections) {
    if (seenFixture.has(selection.fixtureId)) continue;
    const market = marketById.get(selection.fixtureId);
    if (!market) return { ok: false as const, error: "Selection is outside current GameWeek." };
    totalOdds *= selection.side === "HOME" ? market.homeOdds : market.awayOdds;
    seenFixture.add(selection.fixtureId);
    normalizedSelections.push(selection);
  }
  if (normalizedSelections.length === 0) return { ok: false as const, error: "No valid selections." };

  const prisma = getPrisma();
  await prisma.$executeRaw`
    UPDATE gambling_accounts
    SET balance = balance - ${stake},
        updated_at = NOW()
    WHERE participant_name = ${displayName}
  `;
  await prisma.$executeRaw`
    INSERT INTO gambling_bets (participant_name, round, stake, selections, odds, status)
    VALUES (${displayName}, ${state.activeRound}, ${stake}, ${serializeSelections(normalizedSelections)}, ${Number(totalOdds.toFixed(4))}, 'OPEN')
  `;
  return { ok: true as const };
}
