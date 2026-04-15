import type { Fixture } from "@prisma/client";
import { getTournamentDataReadOnly } from "@/lib/data";
import { getPrisma } from "@/lib/prisma";
import { buildCurrentRoundBettingMarkets, buildGauntletBettingMarkets } from "@/lib/supercomputer";
import { getParticipantLoginNames } from "@/lib/participant-auth";
import { getDisplayName } from "@/lib/display-name";

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

export type BetSide =
  | "HOME_WIN"
  | "AWAY_WIN"
  | "BTTS_YES"
  | "BTTS_NO"
  | "MATCH_GOALS_OVER"
  | "MATCH_GOALS_UNDER"
  | "HOME_GOALS_OVER"
  | "HOME_GOALS_UNDER"
  | "AWAY_GOALS_OVER"
  | "AWAY_GOALS_UNDER"
  | "GAUNTLET_WINNER"
  | "OVER_55"
  | "UNDER_55";

export type BetSelection = {
  fixtureId?: string;
  side: BetSide;
  line?: number;
  participantId?: string;
};

export type MarketFixture = {
  fixtureId: string;
  competition: "LEAGUE" | "KNOCKOUT";
  round: number;
  homeName: string;
  awayName: string;
  homePrimaryColor?: string;
  homeSecondaryColor?: string;
  awayPrimaryColor?: string;
  awaySecondaryColor?: string;
  lambdaHome: number;
  lambdaAway: number;
  homeOdds: number;
  awayOdds: number;
  bttsYesOdds: number;
  bttsNoOdds: number;
  locked: boolean;
};

export type GamblingState = {
  activeRound: number | null;
  balance: number;
  rewardNotice: string;
  markets: MarketFixture[];
  gauntletWinnerMarkets: Array<{
    participantId: string;
    displayName: string;
    primaryColor?: string;
    secondaryColor?: string;
    odds: number;
    chance: number;
  }>;
  openBets: Array<{
    id: string;
    stake: number;
    odds: number;
    potentialReturn: number;
    selections: Array<{ fixtureId?: string; side: BetSide; line?: number; participantId?: string; label: string }>;
    cashOutOffer: number | null;
    canCashOut: boolean;
    shareText: string;
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
  leaderboard: Array<{
    displayName: string;
    balance: number;
    primaryColor?: string;
    secondaryColor?: string;
  }>;
};

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

function violatesLateBetRule(fixture: Fixture, betCreatedAt: Date) {
  if (!fixture.playedAt) return false;
  const playedAtMs = fixture.playedAt.getTime();
  const createdMs = betCreatedAt.getTime();
  const SIX_MIN_MS = 6 * 60 * 1000;
  return createdMs >= playedAtMs && createdMs <= playedAtMs + SIX_MIN_MS;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function poissonPmf(k: number, lambda: number) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0) return 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) p *= lambda / i;
  return p;
}

function probabilityOver(lambda: number, line: number) {
  const threshold = Math.floor(line);
  let sum = 0;
  for (let goals = 0; goals <= threshold; goals += 1) sum += poissonPmf(goals, lambda);
  return clamp(1 - sum, 0.0001, 0.9999);
}

function toTwoWayOdds(probA: number, probB: number) {
  const total = Math.max(probA + probB, 1e-9);
  const baseA = probA / total;
  const baseB = probB / total;
  const overround = 1.06;
  const impliedA = Math.max(baseA * overround, 0.03);
  const impliedB = Math.max(baseB * overround, 0.03);
  const aOdds = Math.min(Math.max(1 / impliedA, 1.05), 60);
  const bOdds = Math.min(Math.max(1 / impliedB, 1.05), 60);
  return { aOdds: Number(aOdds.toFixed(2)), bOdds: Number(bOdds.toFixed(2)) };
}

function sideLabel(
  side: BetSide,
  home: string,
  away: string,
  line?: number,
  winnerName?: string,
) {
  if (side === "GAUNTLET_WINNER") return `${winnerName ?? "Team"} to win the Gauntlet`;
  if (side === "HOME_WIN") return `${home} to win`;
  if (side === "AWAY_WIN") return `${away} to win`;
  if (side === "BTTS_YES") return `${home} vs ${away} BTTS: Yes`;
  if (side === "BTTS_NO") return `${home} vs ${away} BTTS: No`;
  if (side === "MATCH_GOALS_OVER" || side === "OVER_55") return `${home} vs ${away} Over ${line ?? 5} goals`;
  if (side === "MATCH_GOALS_UNDER" || side === "UNDER_55") return `${home} vs ${away} Under ${line ?? 5} goals`;
  if (side === "HOME_GOALS_OVER") return `${home} to score over ${line ?? 0}`;
  if (side === "HOME_GOALS_UNDER") return `${home} to score under ${line ?? 0}`;
  if (side === "AWAY_GOALS_OVER") return `${away} to score over ${line ?? 0}`;
  return `${away} to score under ${line ?? 0}`;
}

function normalizedSelection(selection: BetSelection): BetSelection {
  if (selection.side === "GAUNTLET_WINNER") {
    return {
      side: "GAUNTLET_WINNER",
      participantId: selection.participantId,
    };
  }
  if (selection.side === "OVER_55") return { ...selection, side: "MATCH_GOALS_OVER", line: 5 };
  if (selection.side === "UNDER_55") return { ...selection, side: "MATCH_GOALS_UNDER", line: 5 };
  if (
    selection.side === "MATCH_GOALS_OVER" ||
    selection.side === "MATCH_GOALS_UNDER" ||
    selection.side === "HOME_GOALS_OVER" ||
    selection.side === "HOME_GOALS_UNDER" ||
    selection.side === "AWAY_GOALS_OVER" ||
    selection.side === "AWAY_GOALS_UNDER"
  ) {
    return { ...selection, line: clamp(Math.floor(selection.line ?? 0), 0, 25) };
  }
  return selection;
}

function parseSelections(raw: string): BetSelection[] {
  return raw
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [fixtureId, rawSide] = chunk.split(":");
      if (!fixtureId || !rawSide) return null;
      const [sideRaw, lineRaw] = rawSide.split("@");
      const side = sideRaw as BetSide;
      const validSides: BetSide[] = [
        "HOME_WIN",
        "AWAY_WIN",
        "BTTS_YES",
        "BTTS_NO",
        "MATCH_GOALS_OVER",
        "MATCH_GOALS_UNDER",
        "HOME_GOALS_OVER",
        "HOME_GOALS_UNDER",
        "AWAY_GOALS_OVER",
        "AWAY_GOALS_UNDER",
        "OVER_55",
        "UNDER_55",
        "GAUNTLET_WINNER",
      ];
      if (!validSides.includes(side)) return null;
      if (side === "GAUNTLET_WINNER") {
        const participantId = fixtureId;
        if (!participantId) return null;
        return { side: "GAUNTLET_WINNER", participantId };
      }
      const line = lineRaw === undefined ? undefined : Number(lineRaw);
      return normalizedSelection({ fixtureId, side, line: Number.isFinite(line) ? line : undefined, participantId: undefined });
    })
    .filter((entry): entry is BetSelection => Boolean(entry));
}

function serializeSelections(selections: BetSelection[]) {
  return selections
    .map((selection) => {
      const normalized = normalizedSelection(selection);
      if (normalized.side === "GAUNTLET_WINNER") {
        return `${normalized.participantId ?? ""}:${normalized.side}`;
      }
      return normalized.line === undefined
        ? `${normalized.fixtureId}:${normalized.side}`
        : `${normalized.fixtureId}:${normalized.side}@${normalized.line}`;
    })
    .join(",");
}

function selectionWins(selection: BetSelection, fixture: Fixture) {
  const normalized = normalizedSelection(selection);
  const winner = getWinner(fixture);
  const home = fixture.homeGoals ?? 0;
  const away = fixture.awayGoals ?? 0;
  const total = home + away;
  const line = normalized.line ?? 0;

  if (normalized.side === "HOME_WIN") return winner === "HOME";
  if (normalized.side === "AWAY_WIN") return winner === "AWAY";
  if (normalized.side === "BTTS_YES") return home > 0 && away > 0;
  if (normalized.side === "BTTS_NO") return home === 0 || away === 0;
  if (normalized.side === "MATCH_GOALS_OVER") return total > line;
  if (normalized.side === "MATCH_GOALS_UNDER") return total <= line;
  if (normalized.side === "HOME_GOALS_OVER") return home > line;
  if (normalized.side === "HOME_GOALS_UNDER") return home <= line;
  if (normalized.side === "AWAY_GOALS_OVER") return away > line;
  if (normalized.side === "AWAY_GOALS_UNDER") return away <= line;
  return false;
}

function sideOdds(
  market: MarketFixture | null,
  selection: BetSelection,
  gauntletWinnerOddsByParticipantId: Map<string, number>,
) {
  const normalized = normalizedSelection(selection);
  if (normalized.side === "GAUNTLET_WINNER") {
    return gauntletWinnerOddsByParticipantId.get(normalized.participantId ?? "") ?? 60;
  }
  if (!market) return 60;
  if (normalized.side === "HOME_WIN") return market.homeOdds;
  if (normalized.side === "AWAY_WIN") return market.awayOdds;
  if (normalized.side === "BTTS_YES") return market.bttsYesOdds;
  if (normalized.side === "BTTS_NO") return market.bttsNoOdds;
  if (normalized.side === "MATCH_GOALS_OVER") {
    const pOver = probabilityOver(market.lambdaHome + market.lambdaAway, normalized.line ?? 5);
    const pUnder = 1 - pOver;
    return toTwoWayOdds(pOver, pUnder).aOdds;
  }
  if (normalized.side === "MATCH_GOALS_UNDER") {
    const pOver = probabilityOver(market.lambdaHome + market.lambdaAway, normalized.line ?? 5);
    const pUnder = 1 - pOver;
    return toTwoWayOdds(pOver, pUnder).bOdds;
  }
  if (normalized.side === "HOME_GOALS_OVER") {
    const pOver = probabilityOver(market.lambdaHome, normalized.line ?? 0);
    const pUnder = 1 - pOver;
    return toTwoWayOdds(pOver, pUnder).aOdds;
  }
  if (normalized.side === "HOME_GOALS_UNDER") {
    const pOver = probabilityOver(market.lambdaHome, normalized.line ?? 0);
    const pUnder = 1 - pOver;
    return toTwoWayOdds(pOver, pUnder).bOdds;
  }
  if (normalized.side === "AWAY_GOALS_OVER") {
    const pOver = probabilityOver(market.lambdaAway, normalized.line ?? 0);
    const pUnder = 1 - pOver;
    return toTwoWayOdds(pOver, pUnder).aOdds;
  }
  const pOver = probabilityOver(market.lambdaAway, normalized.line ?? 0);
  const pUnder = 1 - pOver;
  return toTwoWayOdds(pOver, pUnder).bOdds;
}

function impliedProbabilityFromOdds(odds: number) {
  return 1 / Math.max(odds, 1.01);
}

function computeConservativeCashout(
  stake: number,
  placedOdds: number,
  unresolvedWinProb: number,
  legsResolved: number,
  totalLegs: number,
) {
  const potentialReturn = Math.max(0, Math.round(stake * placedOdds));
  const progress = totalLegs > 0 ? legsResolved / totalLegs : 0;
  const haircut = Math.min(0.5, Math.max(0.12, 0.4 - progress * 0.14 - unresolvedWinProb * 0.15));
  const raw = potentialReturn * unresolvedWinProb * (1 - haircut);
  const offer = Math.max(0, Math.floor(raw));
  const capped = Math.min(offer, Math.floor(potentialReturn * 0.92));
  return { potentialReturn, offer: capped };
}

function buildShareText(
  selections: Array<{ label: string }>,
  stake: number,
  odds: number,
  potentialReturn: number,
) {
  const legs = selections.map((selection, index) => `${index + 1}. ${selection.label}`).join("\n");
  return [
    "Rocket League Bet Slip",
    "",
    legs,
    "",
    `Stake: ${stake} pts`,
    `Odds: ${odds.toFixed(2)}`,
    `Potential Return: ${potentialReturn} pts`,
  ].join("\n");
}

function getRounds(fixtures: Fixture[]) {
  return [...new Set(fixtures.filter((fixture) => fixture.phase === "LEAGUE").map((fixture) => fixture.round))].sort(
    (a, b) => a - b,
  );
}

function getLatestCompletedRound(fixtures: Fixture[]) {
  const league = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const rounds = getRounds(fixtures);
  let latest = 0;
  for (const round of rounds) {
    const roundFixtures = league.filter((fixture) => fixture.round === round);
    if (roundFixtures.length > 0 && roundFixtures.every(isCompleted)) latest = round;
    else break;
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
    const outcomes = selections.map((selection) => {
      const fixture = byFixture.get(selection.fixtureId);
      if (!fixture || !isCompleted(fixture)) return "PENDING" as const;
      if (violatesLateBetRule(fixture, bet.created_at)) return "LOST" as const;
      return selectionWins(selection, fixture) ? ("WON" as const) : ("LOST" as const);
    });

    if (outcomes.includes("LOST")) {
      await prisma.$executeRaw`
        UPDATE gambling_bets
        SET status = ${"LOST"},
            return_points = ${0},
            settled_at = NOW()
        WHERE id = ${BigInt(bet.id)}
      `;
      continue;
    }
    if (!outcomes.every((outcome) => outcome === "WON")) continue;

    const payout = Math.max(0, Math.round(bet.stake * Number(bet.odds)));
    await prisma.$executeRaw`
      UPDATE gambling_bets
      SET status = ${"WON"},
          return_points = ${payout},
          settled_at = NOW()
      WHERE id = ${BigInt(bet.id)}
    `;
    if (payout > 0) {
      await prisma.$executeRaw`
        UPDATE gambling_accounts
        SET balance = balance + ${payout},
            updated_at = NOW()
        WHERE participant_name = ${bet.participant_name}
      `;
    }
  }
}

function buildCurrentMarkets(
  fixtures: Fixture[],
  participants: Awaited<ReturnType<typeof getTournamentDataReadOnly>>["participants"],
  allowGauntletBetting: boolean,
) {
  const bettingModel = buildCurrentRoundBettingMarkets(participants, fixtures);
  const activeRound = bettingModel.activeRound;
  const activeRoundFixtures = activeRound === null
    ? []
    : fixtures.filter(
        (fixture) =>
          fixture.phase === "LEAGUE" &&
          fixture.round === activeRound &&
          (fixture.homeGoals === null || fixture.awayGoals === null),
      );
  const modelByFixture = new Map(bettingModel.markets.map((market) => [market.fixtureId, market]));
  const byId = new Map(participants.map((participant) => [participant.id, participant]));

  const markets: MarketFixture[] = activeRoundFixtures.map((fixture) => {
    const model = modelByFixture.get(fixture.id);
    const winnerProbs = model
      ? { home: model.homeWinReg + model.drawReg * 0.5, away: model.awayWinReg + model.drawReg * 0.5 }
      : { home: 0.5, away: 0.5 };
    const winnerOdds = toTwoWayOdds(winnerProbs.home, winnerProbs.away);
    const bttsOdds = model ? toTwoWayOdds(model.bttsYes, model.bttsNo) : { aOdds: 2, bOdds: 2 };
    return {
      fixtureId: fixture.id,
      competition: "LEAGUE",
      round: fixture.round,
      homeName: byId.get(fixture.homeParticipantId)?.displayName ?? "Home",
      awayName: byId.get(fixture.awayParticipantId)?.displayName ?? "Away",
      homePrimaryColor: byId.get(fixture.homeParticipantId)?.primaryColor,
      homeSecondaryColor: byId.get(fixture.homeParticipantId)?.secondaryColor,
      awayPrimaryColor: byId.get(fixture.awayParticipantId)?.primaryColor,
      awaySecondaryColor: byId.get(fixture.awayParticipantId)?.secondaryColor,
      lambdaHome: model?.lambdaHome ?? 2.2,
      lambdaAway: model?.lambdaAway ?? 2.1,
      homeOdds: winnerOdds.aOdds,
      awayOdds: winnerOdds.bOdds,
      bttsYesOdds: bttsOdds.aOdds,
      bttsNoOdds: bttsOdds.bOdds,
      locked: false,
    };
  });

  const gauntletModel = allowGauntletBetting
    ? buildGauntletBettingMarkets(participants, fixtures)
    : { matchMarkets: [], winnerChances: [] };
  const knockoutById = new Map(
    fixtures.filter((fixture) => fixture.phase === "KNOCKOUT").map((fixture) => [fixture.id, fixture]),
  );
  const knockoutMarkets: MarketFixture[] = gauntletModel.matchMarkets
    .map((model) => {
      const fixture = knockoutById.get(model.fixtureId);
      if (!fixture) return null;
      return {
        fixtureId: model.fixtureId,
        competition: "KNOCKOUT" as const,
        round: model.round,
        homeName: byId.get(model.homeParticipantId)?.displayName ?? "Home",
        awayName: byId.get(model.awayParticipantId)?.displayName ?? "Away",
        homePrimaryColor: byId.get(model.homeParticipantId)?.primaryColor,
        homeSecondaryColor: byId.get(model.homeParticipantId)?.secondaryColor,
        awayPrimaryColor: byId.get(model.awayParticipantId)?.primaryColor,
        awaySecondaryColor: byId.get(model.awayParticipantId)?.secondaryColor,
        lambdaHome: model.lambdaHome,
        lambdaAway: model.lambdaAway,
        homeOdds: toTwoWayOdds(model.homeWin, model.awayWin).aOdds,
        awayOdds: toTwoWayOdds(model.homeWin, model.awayWin).bOdds,
        bttsYesOdds: toTwoWayOdds(0.5, 0.5).aOdds,
        bttsNoOdds: toTwoWayOdds(0.5, 0.5).bOdds,
        locked: fixture.homeGoals !== null && fixture.awayGoals !== null,
      };
    })
    .filter((entry): entry is MarketFixture => Boolean(entry));

  const gauntletWinnerMarkets = gauntletModel.winnerChances.map((entry) => {
    const team = byId.get(entry.participantId);
    const against = Math.max(1e-6, 1 - entry.chance);
    return {
      participantId: entry.participantId,
      displayName: team?.displayName ?? "Team",
      primaryColor: team?.primaryColor,
      secondaryColor: team?.secondaryColor,
      chance: entry.chance,
      odds: toTwoWayOdds(entry.chance, against).aOdds,
    };
  });

  return { activeRound, markets: [...markets, ...knockoutMarkets], gauntletWinnerMarkets };
}

export async function getGamblingState(displayName: string): Promise<GamblingState> {
  const { tournament, participants, fixtures } = await getTournamentDataReadOnly();
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const leagueComplete = leagueFixtures.length > 0 && leagueFixtures.every(isCompleted);
  const allowGauntletBetting =
    leagueComplete && (tournament.status === "KNOCKOUT" || tournament.status === "COMPLETE");
  const { activeRound, markets, gauntletWinnerMarkets } = buildCurrentMarkets(
    fixtures,
    participants,
    allowGauntletBetting,
  );

  await ensureAccountsInitialized(activeRound);
  await applyWeeklyRewards(getLatestCompletedRound(fixtures));
  await settleOpenBets(fixtures);

  const accounts = await getAccounts();
  const account = accounts.find((entry) => entry.participant_name.toLowerCase() === displayName.toLowerCase());
  const balance = account?.balance ?? 100;
  const marketById = new Map(markets.map((market) => [market.fixtureId, market]));
  const fixtureById = new Map(
    fixtures.map((fixture) => [fixture.id, fixture]),
  );
  const gauntletWinnerOddsByParticipantId = new Map(
    gauntletWinnerMarkets.map((market) => [market.participantId, market.odds]),
  );

  const bets = (await getBets()).filter((bet) => bet.participant_name.toLowerCase() === displayName.toLowerCase());
  const openBets = bets
    .filter((bet) => bet.status === "OPEN")
    .map((bet) => {
      const selections = parseSelections(bet.selections);
      const totalLegs = selections.length;
      let legsResolved = 0;
      let deadBet = false;
      let unresolvedProbProduct = 1;
      const selectionView = selections.map((selection) => {
        const fixture = fixtureById.get(selection.fixtureId);
        const market = selection.fixtureId ? marketById.get(selection.fixtureId) : undefined;
        const home = market?.homeName ?? "Home";
        const away = market?.awayName ?? "Away";
        const winnerName =
          selection.side === "GAUNTLET_WINNER"
            ? participants.find((entry) => entry.id === selection.participantId)?.displayName
            : undefined;

        if (selection.side === "GAUNTLET_WINNER") {
          if (tournament.status === "COMPLETE") {
            const final = fixtures
              .filter((entry) => entry.phase === "KNOCKOUT")
              .sort((a, b) => b.round - a.round)[0];
            if (final && isCompleted(final)) {
              legsResolved += 1;
              const winnerId =
                final.homeGoals! > final.awayGoals!
                  ? final.homeParticipantId
                  : final.awayGoals! > final.homeGoals!
                    ? final.awayParticipantId
                    : final.overtimeWinner === "HOME"
                      ? final.homeParticipantId
                      : final.awayParticipantId;
              if (winnerId !== selection.participantId) deadBet = true;
            } else {
              unresolvedProbProduct *= impliedProbabilityFromOdds(
                sideOdds(null, selection, gauntletWinnerOddsByParticipantId),
              );
            }
          } else {
            unresolvedProbProduct *= impliedProbabilityFromOdds(
              sideOdds(null, selection, gauntletWinnerOddsByParticipantId),
            );
          }
        } else if (fixture && isCompleted(fixture)) {
          legsResolved += 1;
          if (violatesLateBetRule(fixture, bet.created_at)) deadBet = true;
          if (!selectionWins(selection, fixture)) deadBet = true;
        } else if (market) {
          unresolvedProbProduct *= impliedProbabilityFromOdds(
            sideOdds(market, selection, gauntletWinnerOddsByParticipantId),
          );
        } else {
          unresolvedProbProduct *= 0.5;
        }

        return {
          fixtureId: selection.fixtureId,
          side: selection.side,
          line: selection.line,
          participantId: selection.participantId,
          label: sideLabel(selection.side, getDisplayName(home), getDisplayName(away), selection.line, winnerName),
        };
      });

      const { potentialReturn, offer } = computeConservativeCashout(
        bet.stake,
        Number(bet.odds),
        deadBet ? 0 : unresolvedProbProduct,
        legsResolved,
        totalLegs,
      );
      const canCashOut = !deadBet && offer >= 1 && legsResolved > 0 && legsResolved < totalLegs;
      return {
        id: bet.id,
        stake: bet.stake,
        odds: Number(bet.odds),
        potentialReturn,
        selections: selectionView,
        cashOutOffer: canCashOut ? offer : null,
        canCashOut,
        shareText: buildShareText(selectionView, bet.stake, Number(bet.odds), potentialReturn),
        createdAt: bet.created_at.toISOString(),
      };
    });

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

  const byName = new Map(participants.map((participant) => [participant.displayName.toLowerCase(), participant]));
  const leaderboard = accounts
    .map((entry) => ({
      displayName: entry.participant_name,
      balance: entry.balance,
      primaryColor: byName.get(entry.participant_name.toLowerCase())?.primaryColor,
      secondaryColor: byName.get(entry.participant_name.toLowerCase())?.secondaryColor,
    }))
    .sort((a, b) => b.balance - a.balance || a.displayName.localeCompare(b.displayName));

  const rewardNotice = activeRound
    ? `Each completed GameWeek from GW${account?.reward_start_round ?? activeRound} onward adds +100 points.`
    : "Rewards activate once fixtures exist.";

  return {
    activeRound,
    balance,
    rewardNotice,
    markets,
    gauntletWinnerMarkets,
    openBets,
    settledBets,
    leaderboard,
  };
}

export async function placeSingleBet(displayName: string, fixtureId: string, side: BetSide, stake: number, line?: number) {
  if (side === "GAUNTLET_WINNER") {
    return placeBet(displayName, [{ side, participantId: fixtureId }], stake);
  }
  return placeBet(displayName, [{ fixtureId, side, line }], stake);
}

export async function placeAccumulatorBet(displayName: string, selections: BetSelection[], stake: number) {
  if (selections.length < 1) return { ok: false as const, error: "Add at least one selection to your slip." };
  return placeBet(displayName, selections, stake);
}

async function placeBet(displayName: string, selections: BetSelection[], stake: number) {
  if (!Number.isInteger(stake) || stake <= 0) {
    return { ok: false as const, error: "Stake must be a positive whole number." };
  }
  const state = await getGamblingState(displayName);
  if (state.activeRound === null) return { ok: false as const, error: "No active GameWeek." };
  if (stake > state.balance) return { ok: false as const, error: "Insufficient points balance." };

  const marketById = new Map(state.markets.map((market) => [market.fixtureId, market]));
  const gauntletWinnerOddsByParticipantId = new Map(
    state.gauntletWinnerMarkets.map((entry) => [entry.participantId, entry.odds]),
  );
  let totalOdds = 1;
  const normalizedSelections: BetSelection[] = [];
  const seen = new Set<string>();

  for (const rawSelection of selections) {
    const selection = normalizedSelection(rawSelection);
    const key = `${selection.fixtureId ?? selection.participantId ?? ""}:${selection.side}:${selection.line ?? ""}`;
    if (seen.has(key)) continue;
    if (selection.side === "GAUNTLET_WINNER") {
      if (!selection.participantId || !gauntletWinnerOddsByParticipantId.has(selection.participantId)) {
        return { ok: false as const, error: "Invalid Gauntlet winner selection." };
      }
      totalOdds *= sideOdds(null, selection, gauntletWinnerOddsByParticipantId);
    } else {
      const market = selection.fixtureId ? marketById.get(selection.fixtureId) : undefined;
      if (!market) return { ok: false as const, error: "Selection is outside available fixtures." };
      if (market.locked) return { ok: false as const, error: "One of your selected fixtures is already complete." };
      totalOdds *= sideOdds(market, selection, gauntletWinnerOddsByParticipantId);
    }
    seen.add(key);
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

export async function cashOutBet(displayName: string, betId: string) {
  await ensureTables();
  const state = await getGamblingState(displayName);
  const bet = state.openBets.find((entry) => entry.id === betId);
  if (!bet) return { ok: false as const, error: "Bet not found or no longer open." };
  if (!bet.canCashOut || bet.cashOutOffer === null || bet.cashOutOffer < 1) {
    return { ok: false as const, error: "Cash out unavailable for this bet right now." };
  }

  const prisma = getPrisma();
  const updated = await prisma.$executeRaw`
    UPDATE gambling_bets
    SET status = ${"WON"},
        return_points = ${bet.cashOutOffer},
        settled_at = NOW()
    WHERE id = ${BigInt(betId)} AND participant_name = ${displayName} AND status = 'OPEN'
  `;
  if (!updated) return { ok: false as const, error: "Bet already settled." };

  await prisma.$executeRaw`
    UPDATE gambling_accounts
    SET balance = balance + ${bet.cashOutOffer},
        updated_at = NOW()
    WHERE participant_name = ${displayName}
  `;
  return { ok: true as const };
}

export async function resetGamblingAndChatForTesting() {
  await ensureTables();
  const prisma = getPrisma();
  const names = getParticipantLoginNames();
  const { fixtures } = await getTournamentDataReadOnly();
  const latestCompletedRound = getLatestCompletedRound(fixtures);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS chat_messages (id BIGSERIAL PRIMARY KEY, participant_name TEXT NOT NULL, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS chat_presence (participant_name TEXT PRIMARY KEY, last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE gambling_bets RESTART IDENTITY`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE chat_messages RESTART IDENTITY`);
  await prisma.$executeRawUnsafe(`DELETE FROM chat_presence`);

  for (const name of names) {
    await prisma.$executeRaw`
      INSERT INTO gambling_accounts (participant_name, balance, reward_start_round, last_rewarded_round, updated_at)
      VALUES (${name}, 100, ${latestCompletedRound + 1}, ${latestCompletedRound}, NOW())
      ON CONFLICT (participant_name)
      DO UPDATE SET balance = 100, reward_start_round = ${latestCompletedRound + 1}, last_rewarded_round = ${latestCompletedRound}, updated_at = NOW()
    `;
  }
}
