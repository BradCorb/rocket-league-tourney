import type { Fixture } from "@prisma/client";
import { getTournamentDataReadOnly } from "@/lib/data";
import { getPrisma } from "@/lib/prisma";
import { buildCurrentRoundBettingMarkets, buildGauntletBettingMarkets } from "@/lib/supercomputer";
import { getParticipantLoginNames } from "@/lib/participant-auth";
import { getDisplayName, getDisplayNameKey } from "@/lib/display-name";

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
  | "DRAW_REG"
  | "HOME_WIN_OT"
  | "AWAY_WIN_OT"
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
  placedOdds?: number;
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
  drawOdds: number;
  homeOtOdds: number;
  awayOtOdds: number;
  homeOtAddonOdds: number;
  awayOtAddonOdds: number;
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
    selections: Array<{
      fixtureId?: string;
      side: BetSide;
      line?: number;
      participantId?: string;
      label: string;
      odds?: number;
      result: "PENDING" | "WON" | "LOST" | "VOID";
    }>;
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
    selections: Array<{
      fixtureId?: string;
      side: BetSide;
      line?: number;
      participantId?: string;
      label: string;
      odds?: number;
      result: "PENDING" | "WON" | "LOST" | "VOID";
    }>;
  }>;
  leaderboard: Array<{
    displayName: string;
    balance: number;
    primaryColor?: string;
    secondaryColor?: string;
  }>;
};

function isCompleted(fixture: { homeGoals: number | null; awayGoals: number | null; status?: string | null }) {
  return fixture.homeGoals !== null && fixture.awayGoals !== null && fixture.status === "COMPLETED";
}

function isLiveForCashout(fixture: { homeGoals: number | null; awayGoals: number | null; status?: string | null }) {
  return fixture.homeGoals !== null && fixture.awayGoals !== null && fixture.status !== "COMPLETED";
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
  // Allow longer prices so rare slider outcomes are not flattened together.
  // Lower floor so raw prices can exceed 1050/1 before display cap.
  const impliedA = Math.max(baseA * overround, 0.0005);
  const impliedB = Math.max(baseB * overround, 0.0005);
  const aOdds = Math.min(Math.max(1 / impliedA, 1.05), 2001);
  const bOdds = Math.min(Math.max(1 / impliedB, 1.05), 2001);
  return { aOdds: Number(aOdds.toFixed(4)), bOdds: Number(bOdds.toFixed(4)) };
}

function estimateRate(successes: number, attempts: number, priorMean = 0.5, priorWeight = 4) {
  const safeAttempts = Math.max(0, attempts);
  const safeSuccesses = Math.max(0, Math.min(successes, safeAttempts));
  return (safeSuccesses + priorMean * priorWeight) / (safeAttempts + priorWeight);
}

function estimateBttsYesProbability(
  fixtures: Fixture[],
  homeParticipantId: string,
  awayParticipantId: string,
  lambdaHome: number,
  lambdaAway: number,
) {
  const completedLeague = fixtures.filter(
    (fixture) =>
      fixture.phase === "LEAGUE" &&
      fixture.homeGoals !== null &&
      fixture.awayGoals !== null &&
      fixture.resultKind !== "DOUBLE_FORFEIT",
  );

  const homeAtHome = completedLeague.filter((fixture) => fixture.homeParticipantId === homeParticipantId);
  const awayAtAway = completedLeague.filter((fixture) => fixture.awayParticipantId === awayParticipantId);
  const homeAll = completedLeague.filter(
    (fixture) => fixture.homeParticipantId === homeParticipantId || fixture.awayParticipantId === homeParticipantId,
  );
  const awayAll = completedLeague.filter(
    (fixture) => fixture.homeParticipantId === awayParticipantId || fixture.awayParticipantId === awayParticipantId,
  );
  const h2h = completedLeague.filter(
    (fixture) =>
      (fixture.homeParticipantId === homeParticipantId && fixture.awayParticipantId === awayParticipantId) ||
      (fixture.homeParticipantId === awayParticipantId && fixture.awayParticipantId === homeParticipantId),
  );

  const homeScoredHome = estimateRate(
    homeAtHome.filter((fixture) => (fixture.homeGoals ?? 0) > 0).length,
    homeAtHome.length,
    0.68,
    5,
  );
  const homeConcededHome = estimateRate(
    homeAtHome.filter((fixture) => (fixture.awayGoals ?? 0) > 0).length,
    homeAtHome.length,
    0.68,
    5,
  );
  const awayScoredAway = estimateRate(
    awayAtAway.filter((fixture) => (fixture.awayGoals ?? 0) > 0).length,
    awayAtAway.length,
    0.68,
    5,
  );
  const awayConcededAway = estimateRate(
    awayAtAway.filter((fixture) => (fixture.homeGoals ?? 0) > 0).length,
    awayAtAway.length,
    0.68,
    5,
  );

  const homeScoredAll = estimateRate(
    homeAll.filter((fixture) =>
      fixture.homeParticipantId === homeParticipantId ? (fixture.homeGoals ?? 0) > 0 : (fixture.awayGoals ?? 0) > 0,
    ).length,
    homeAll.length,
    0.7,
    6,
  );
  const homeConcededAll = estimateRate(
    homeAll.filter((fixture) =>
      fixture.homeParticipantId === homeParticipantId ? (fixture.awayGoals ?? 0) > 0 : (fixture.homeGoals ?? 0) > 0,
    ).length,
    homeAll.length,
    0.7,
    6,
  );
  const awayScoredAll = estimateRate(
    awayAll.filter((fixture) =>
      fixture.homeParticipantId === awayParticipantId ? (fixture.homeGoals ?? 0) > 0 : (fixture.awayGoals ?? 0) > 0,
    ).length,
    awayAll.length,
    0.7,
    6,
  );
  const awayConcededAll = estimateRate(
    awayAll.filter((fixture) =>
      fixture.homeParticipantId === awayParticipantId ? (fixture.awayGoals ?? 0) > 0 : (fixture.homeGoals ?? 0) > 0,
    ).length,
    awayAll.length,
    0.7,
    6,
  );

  const leagueBtts = estimateRate(
    completedLeague.filter((fixture) => (fixture.homeGoals ?? 0) > 0 && (fixture.awayGoals ?? 0) > 0).length,
    completedLeague.length,
    0.62,
    8,
  );
  const h2hBtts = estimateRate(
    h2h.filter((fixture) => (fixture.homeGoals ?? 0) > 0 && (fixture.awayGoals ?? 0) > 0).length,
    h2h.length,
    leagueBtts,
    4,
  );

  const poissonHomeScore = clamp(1 - Math.exp(-Math.max(0.05, lambdaHome)), 0.03, 0.99);
  const poissonAwayScore = clamp(1 - Math.exp(-Math.max(0.05, lambdaAway)), 0.03, 0.99);
  const poissonBtts = clamp(poissonHomeScore * poissonAwayScore, 0.03, 0.99);
  const poissonBttsNo = clamp(1 - poissonBtts, 0.01, 0.97);

  const matchupSignalA = homeScoredHome * awayConcededAway;
  const matchupSignalB = awayScoredAway * homeConcededHome;
  const globalSignalA = homeScoredAll * awayConcededAll;
  const globalSignalB = awayScoredAll * homeConcededAll;

  const blendedYes =
    poissonBtts * 0.24 +
    matchupSignalA * 0.2 +
    matchupSignalB * 0.2 +
    globalSignalA * 0.14 +
    globalSignalB * 0.14 +
    leagueBtts * 0.05 +
    h2hBtts * 0.03;

  // Team clean-sheet and fail-to-score paths should drive BTTS No variation fixture-by-fixture.
  const homeCleanRate = estimateRate(
    homeAll.filter((fixture) =>
      fixture.homeParticipantId === homeParticipantId ? (fixture.awayGoals ?? 0) === 0 : (fixture.homeGoals ?? 0) === 0,
    ).length,
    homeAll.length,
    0.22,
    6,
  );
  const awayCleanRate = estimateRate(
    awayAll.filter((fixture) =>
      fixture.homeParticipantId === awayParticipantId ? (fixture.awayGoals ?? 0) === 0 : (fixture.homeGoals ?? 0) === 0,
    ).length,
    awayAll.length,
    0.22,
    6,
  );
  const homeFailToScore = clamp(1 - homeScoredHome * 0.65 - homeScoredAll * 0.35, 0.03, 0.8);
  const awayFailToScore = clamp(1 - awayScoredAway * 0.65 - awayScoredAll * 0.35, 0.03, 0.8);
  const homeBlankPath = clamp(homeFailToScore * 0.58 + awayConcededAway * 0.12 + awayCleanRate * 0.3, 0.02, 0.9);
  const awayBlankPath = clamp(awayFailToScore * 0.58 + homeConcededHome * 0.12 + homeCleanRate * 0.3, 0.02, 0.9);
  const bothBlankPoisson = clamp(Math.exp(-(lambdaHome + lambdaAway)), 0.0001, 0.2);
  const empiricalNo = clamp(
    homeBlankPath + awayBlankPath - homeBlankPath * awayBlankPath + bothBlankPoisson * 0.2,
    0.03,
    0.75,
  );

  // Dynamic weighting: early season -> more Poisson; later -> more empirical paths.
  const sampleSize = completedLeague.length;
  const empiricalConfidence = clamp(sampleSize / 26, 0.2, 0.86);
  const poissonNoWeight = 1 - empiricalConfidence;
  const noFromYesModel = clamp(1 - blendedYes, 0.02, 0.85);
  const weightedNo =
    poissonBttsNo * (poissonNoWeight * 0.55) +
    empiricalNo * (empiricalConfidence * 0.65) +
    noFromYesModel * 0.25 +
    (1 - h2hBtts) * 0.08 +
    (1 - leagueBtts) * 0.12;

  // Soft rails preserve realism while keeping fixture-specific differentiation.
  const leagueNo = clamp(1 - leagueBtts, 0.05, 0.72);
  const noLowerBound = clamp(Math.min(leagueNo * 0.3, poissonBttsNo * 0.6), 0.015, 0.18);
  const noUpperBound = clamp(Math.max(leagueNo * 1.7, poissonBttsNo * 2.8), 0.16, 0.82);
  const boundedNo = clamp(weightedNo, noLowerBound, noUpperBound);
  return clamp(1 - boundedNo, 0.2, 0.98);
}

function resolveParticipantIdForDisplayName(
  displayName: string,
  participants: Awaited<ReturnType<typeof getTournamentDataReadOnly>>["participants"],
) {
  const normalized = getDisplayName(displayName).trim().toLowerCase();
  return participants.find((participant) => getDisplayName(participant.displayName).trim().toLowerCase() === normalized)?.id ?? null;
}

function sideLabel(
  side: BetSide,
  home: string,
  away: string,
  line?: number,
  winnerName?: string,
) {
  const lineLabel = `${Math.max(0, Math.floor(line ?? 0))}.5`;
  if (side === "GAUNTLET_WINNER") return `${winnerName ?? "Team"} to win the Gauntlet`;
  if (side === "HOME_WIN") return `${home} to win`;
  if (side === "AWAY_WIN") return `${away} to win`;
  if (side === "DRAW_REG") return `${home} vs ${away} to be level after regulation`;
  if (side === "HOME_WIN_OT") return `${home} to win in OT`;
  if (side === "AWAY_WIN_OT") return `${away} to win in OT`;
  if (side === "BTTS_YES") return `${home} vs ${away} BTTS: Yes`;
  if (side === "BTTS_NO") return `${home} vs ${away} BTTS: No`;
  if (side === "MATCH_GOALS_OVER" || side === "OVER_55") return `${home} vs ${away} Over ${lineLabel} goals`;
  if (side === "MATCH_GOALS_UNDER" || side === "UNDER_55") return `${home} vs ${away} Under ${lineLabel} goals`;
  if (side === "HOME_GOALS_OVER") return `${home} to score over ${lineLabel}`;
  if (side === "HOME_GOALS_UNDER") return `${home} to score under ${lineLabel}`;
  if (side === "AWAY_GOALS_OVER") return `${away} to score over ${lineLabel}`;
  return `${away} to score under ${lineLabel}`;
}

function normalizedSelection(selection: BetSelection): BetSelection {
  if (selection.side === "GAUNTLET_WINNER") {
    return {
      side: "GAUNTLET_WINNER",
      participantId: selection.participantId,
      placedOdds: selection.placedOdds,
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
    return { ...selection, line: clamp(Math.floor(selection.line ?? 0), 0, 25), placedOdds: selection.placedOdds };
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
      const [sideAndLineToken, oddsToken] = rawSide.split("#");
      const [sideRaw, lineToken] = sideAndLineToken.split("@");
      const side = sideRaw as BetSide;
      const validSides: BetSide[] = [
        "HOME_WIN",
        "AWAY_WIN",
        "DRAW_REG",
        "HOME_WIN_OT",
        "AWAY_WIN_OT",
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
        const gauntletOdds = Number(oddsToken);
        return {
          side: "GAUNTLET_WINNER",
          participantId,
          placedOdds: Number.isFinite(gauntletOdds) ? gauntletOdds : undefined,
        };
      }
      const line = lineToken === undefined ? undefined : Number(lineToken);
      const placedOdds = Number(oddsToken);
      return normalizedSelection({
        fixtureId,
        side,
        line: Number.isFinite(line) ? line : undefined,
        participantId: undefined,
        placedOdds: Number.isFinite(placedOdds) ? placedOdds : undefined,
      });
    })
    .filter((entry): entry is BetSelection => Boolean(entry));
}

function serializeSelections(selections: BetSelection[]) {
  return selections
    .map((selection) => {
      const normalized = normalizedSelection(selection);
      if (normalized.side === "GAUNTLET_WINNER") {
        return normalized.placedOdds === undefined
          ? `${normalized.participantId ?? ""}:${normalized.side}`
          : `${normalized.participantId ?? ""}:${normalized.side}#${Number(normalized.placedOdds.toFixed(4))}`;
      }
      const base =
        normalized.line === undefined
          ? `${normalized.fixtureId}:${normalized.side}`
          : `${normalized.fixtureId}:${normalized.side}@${normalized.line}`;
      return normalized.placedOdds === undefined ? base : `${base}#${Number(normalized.placedOdds.toFixed(4))}`;
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
  if (normalized.side === "DRAW_REG") return fixture.overtimeWinner === "HOME" || fixture.overtimeWinner === "AWAY";
  if (normalized.side === "HOME_WIN_OT") return fixture.overtimeWinner === "HOME";
  if (normalized.side === "AWAY_WIN_OT") return fixture.overtimeWinner === "AWAY";
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

function getGauntletWinnerId(fixtures: Fixture[]) {
  const final = fixtures
    .filter((fixture) => fixture.phase === "KNOCKOUT")
    .sort((a, b) => b.round - a.round)[0];
  if (!final || !isCompleted(final)) return null;
  const winner = getWinner(final);
  if (winner === "HOME") return final.homeParticipantId;
  if (winner === "AWAY") return final.awayParticipantId;
  return null;
}

function selectionResult(
  selection: BetSelection,
  fixtureById: Map<string, Fixture>,
  betCreatedAt: Date,
  tournamentStatus: "SETUP" | "LEAGUE" | "KNOCKOUT" | "COMPLETE",
  gauntletWinnerId: string | null,
): "PENDING" | "WON" | "LOST" | "VOID" {
  if (selection.side === "GAUNTLET_WINNER") {
    if (tournamentStatus !== "COMPLETE") return "PENDING";
    if (!gauntletWinnerId) return "PENDING";
    return selection.participantId === gauntletWinnerId ? "WON" : "LOST";
  }
  if (!selection.fixtureId) return "LOST";
  const fixture = fixtureById.get(selection.fixtureId);
  if (!fixture || !isCompleted(fixture)) return "PENDING";
  if (fixture.resultKind && fixture.resultKind !== "NORMAL") return "VOID";
  if (violatesLateBetRule(fixture, betCreatedAt)) return "LOST";
  return selectionWins(selection, fixture) ? "WON" : "LOST";
}

function computeSlipOddsFromSelections(
  selections: BetSelection[],
  marketById: Map<string, MarketFixture>,
  gauntletWinnerOddsByParticipantId: Map<string, number>,
) {
  if (selections.length === 0) return 1;
  let totalOdds = 1;
  for (const selection of selections) {
    if (typeof selection.placedOdds === "number" && Number.isFinite(selection.placedOdds) && selection.placedOdds > 1) {
      totalOdds *= selection.placedOdds;
      continue;
    }
    if (selection.side === "GAUNTLET_WINNER") {
      totalOdds *= sideOdds(null, selection, gauntletWinnerOddsByParticipantId);
      continue;
    }
    const market = selection.fixtureId ? marketById.get(selection.fixtureId) : undefined;
    totalOdds *= market ? sideOdds(market, selection, gauntletWinnerOddsByParticipantId) : 1;
  }
  return Number(totalOdds.toFixed(4));
}

function areGoalSelectionsFeasible(selections: BetSelection[]) {
  let homeMin = 0;
  let homeMax = Number.POSITIVE_INFINITY;
  let awayMin = 0;
  let awayMax = Number.POSITIVE_INFINITY;
  let matchMin = 0;
  let matchMax = Number.POSITIVE_INFINITY;

  for (const selection of selections) {
    const normalized = normalizedSelection(selection);
    const line = Math.max(0, Math.floor(normalized.line ?? 0));
    if (normalized.side === "HOME_GOALS_OVER") homeMin = Math.max(homeMin, line + 1);
    if (normalized.side === "HOME_GOALS_UNDER") homeMax = Math.min(homeMax, line);
    if (normalized.side === "AWAY_GOALS_OVER") awayMin = Math.max(awayMin, line + 1);
    if (normalized.side === "AWAY_GOALS_UNDER") awayMax = Math.min(awayMax, line);
    if (normalized.side === "MATCH_GOALS_OVER") matchMin = Math.max(matchMin, line + 1);
    if (normalized.side === "MATCH_GOALS_UNDER") matchMax = Math.min(matchMax, line);
  }

  if (homeMin > homeMax || awayMin > awayMax || matchMin > matchMax) return false;
  const totalMin = homeMin + awayMin;
  const totalMax = homeMax + awayMax;
  const feasibleMin = Math.max(totalMin, matchMin);
  const feasibleMax = Math.min(totalMax, matchMax);
  return feasibleMin <= feasibleMax;
}

function guaranteedWinnerFromGoalSelections(
  selections: Array<{ side: BetSide; line?: number }>,
): "HOME_WIN" | "AWAY_WIN" | null {
  let homeMin = 0;
  let homeMax = Number.POSITIVE_INFINITY;
  let awayMin = 0;
  let awayMax = Number.POSITIVE_INFINITY;
  let matchMin = 0;
  let matchMax = Number.POSITIVE_INFINITY;

  for (const selection of selections) {
    const line = Math.max(0, Math.floor(selection.line ?? 0));
    if (selection.side === "HOME_GOALS_OVER") homeMin = Math.max(homeMin, line + 1);
    if (selection.side === "HOME_GOALS_UNDER") homeMax = Math.min(homeMax, line);
    if (selection.side === "AWAY_GOALS_OVER") awayMin = Math.max(awayMin, line + 1);
    if (selection.side === "AWAY_GOALS_UNDER") awayMax = Math.min(awayMax, line);
    if (selection.side === "MATCH_GOALS_OVER") matchMin = Math.max(matchMin, line + 1);
    if (selection.side === "MATCH_GOALS_UNDER") matchMax = Math.min(matchMax, line);
  }

  if (homeMin > homeMax || awayMin > awayMax || matchMin > matchMax) return null;
  const safeHomeMax = Math.min(30, homeMax);
  const safeAwayMax = Math.min(30, awayMax);
  let hasHomeWin = false;
  let hasAwayWin = false;
  let hasDraw = false;

  for (let home = homeMin; home <= safeHomeMax; home += 1) {
    for (let away = awayMin; away <= safeAwayMax; away += 1) {
      const total = home + away;
      if (total < matchMin || total > matchMax) continue;
      if (home > away) hasHomeWin = true;
      else if (away > home) hasAwayWin = true;
      else hasDraw = true;
      if (hasHomeWin && hasAwayWin && hasDraw) return null;
    }
  }

  if (hasHomeWin && !hasAwayWin && !hasDraw) return "HOME_WIN";
  if (hasAwayWin && !hasHomeWin && !hasDraw) return "AWAY_WIN";
  return null;
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
  if (normalized.side === "DRAW_REG") return market.drawOdds;
  if (normalized.side === "HOME_WIN_OT") return market.homeOtAddonOdds;
  if (normalized.side === "AWAY_WIN_OT") return market.awayOtAddonOdds;
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

function formatFractionalOddsForShare(decimalOdds: number) {
  const safeDecimal = Number.isFinite(decimalOdds) ? Math.max(1.01, decimalOdds) : 2;
  const target = safeDecimal - 1;
  const preferredDenominators = [1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 15, 20, 23, 25, 30] as const;
  if (target < 0.2) {
    const denominator = Math.max(2, Math.round(1 / Math.max(target, 0.01)));
    return `1/${Math.min(50, denominator)}`;
  }
  if (target > 7.5) {
    const roundedLong =
      target >= 500
        ? Math.max(500, Math.floor(target / 50) * 50)
        : target >= 100
          ? Math.max(100, Math.floor(target / 25) * 25)
          : target >= 80
            ? Math.max(80, Math.floor(target / 5) * 5)
            : Math.max(8, Math.floor(target / 2) * 2);
    if (target > 1050) return "1000/1";
    return `${roundedLong}/1`;
  }
  let bestN = 1;
  let bestD = 1;
  let bestErr = Number.POSITIVE_INFINITY;
  for (const d of preferredDenominators) {
    for (let n = 1; n <= 25; n += 1) {
      const approx = n / d;
      const err = Math.abs(target - approx);
      if (err < bestErr) {
        bestErr = err;
        bestN = n;
        bestD = d;
      }
    }
  }
  return `${bestN}/${bestD}`;
}

function buildShareText(
  betId: string,
  createdAt: Date,
  selections: Array<{ label: string }>,
  stake: number,
  odds: number,
  potentialReturn: number,
) {
  const legs = selections.map((selection, index) => `- ${index + 1}) ${selection.label}`).join("\n");
  const profit = Math.max(0, potentialReturn - stake);
  const fractionalOdds = formatFractionalOddsForShare(odds);
  const placed = createdAt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return [
    "ROCKET LEAGUE BET SLIP",
    "",
    `Bet ID: #${betId}`,
    `Placed: ${placed}`,
    `Selections: ${selections.length}`,
    "",
    "PICKS",
    "------------------------------",
    legs,
    "",
    "TOTALS",
    "------------------------------",
    `Odds: ${fractionalOdds} (${odds.toFixed(2)} dec)`,
    `Stake: ${stake} pts`,
    `Potential Return: ${potentialReturn} pts`,
    `Potential Profit: ${profit} pts`,
    "",
    "Share from Rocket League Tourney",
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
    const reward = roundsRewarded * 10;
    await prisma.$executeRaw`
      UPDATE gambling_accounts
      SET balance = balance + ${reward},
          last_rewarded_round = ${latestCompletedRound},
          updated_at = NOW()
      WHERE participant_name = ${account.participant_name}
    `;
  }
}

async function settleOpenBets(fixtures: Fixture[], tournamentStatus: "SETUP" | "LEAGUE" | "KNOCKOUT" | "COMPLETE") {
  const prisma = getPrisma();
  const bets = (await getBets()).filter((bet) => bet.status === "OPEN");
  const byFixture = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const gauntletWinnerId = getGauntletWinnerId(fixtures);
  const { tournament, participants } = await getTournamentDataReadOnly();
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const leagueComplete = leagueFixtures.length > 0 && leagueFixtures.every(isCompleted);
  const allowGauntletBetting =
    leagueComplete && (tournament.status === "KNOCKOUT" || tournament.status === "COMPLETE");
  const marketSnapshot = buildCurrentMarkets(fixtures, participants, allowGauntletBetting);
  const marketById = new Map(marketSnapshot.markets.map((market) => [market.fixtureId, market]));
  const gauntletWinnerOddsByParticipantId = new Map(
    marketSnapshot.gauntletWinnerMarkets.map((entry) => [entry.participantId, entry.odds]),
  );

  for (const bet of bets) {
    let selections = parseSelections(bet.selections);
    if (selections.length === 0) continue;
    let outcomes = selections.map((selection) =>
      selectionResult(selection, byFixture, bet.created_at, tournamentStatus, gauntletWinnerId),
    );

    if (outcomes.includes("VOID")) {
      const keptSelections = selections.filter((_, index) => outcomes[index] !== "VOID");
      if (keptSelections.length === 0) {
        await prisma.$executeRaw`
          UPDATE gambling_bets
          SET status = ${"WON"},
              selections = ${""},
              odds = ${1},
              return_points = ${bet.stake},
              settled_at = NOW()
          WHERE id = ${BigInt(bet.id)}
        `;
        await prisma.$executeRaw`
          UPDATE gambling_accounts
          SET balance = balance + ${bet.stake},
              updated_at = NOW()
          WHERE participant_name = ${bet.participant_name}
        `;
        continue;
      }

      const recalculatedOdds = computeSlipOddsFromSelections(
        keptSelections,
        marketById,
        gauntletWinnerOddsByParticipantId,
      );
      await prisma.$executeRaw`
        UPDATE gambling_bets
        SET selections = ${serializeSelections(keptSelections)},
            odds = ${recalculatedOdds}
        WHERE id = ${BigInt(bet.id)}
      `;
      selections = keptSelections;
      outcomes = selections.map((selection) =>
        selectionResult(selection, byFixture, bet.created_at, tournamentStatus, gauntletWinnerId),
      );
    }

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

    const payoutOdds = computeSlipOddsFromSelections(selections, marketById, gauntletWinnerOddsByParticipantId);
    const payout = Math.max(0, Math.round(bet.stake * payoutOdds));
    await prisma.$executeRaw`
      UPDATE gambling_bets
      SET status = ${"WON"},
          odds = ${payoutOdds},
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
      ? { home: model.homeWinReg + model.homeWinOt, away: model.awayWinReg + model.awayWinOt }
      : { home: 0.5, away: 0.5 };
    const winnerOdds = toTwoWayOdds(winnerProbs.home, winnerProbs.away);
    const bttsOdds = (() => {
      if (!model) return { aOdds: 2, bOdds: 2 };
      const blendedBttsYes = estimateBttsYesProbability(
        fixtures,
        fixture.homeParticipantId,
        fixture.awayParticipantId,
        model.lambdaHome,
        model.lambdaAway,
      );
      const blendedBttsNo = clamp(1 - blendedBttsYes, 0.1, 0.86);
      return toTwoWayOdds(blendedBttsYes, blendedBttsNo);
    })();
    const drawOdds = model
      ? Number(Math.min(Math.max((1 / Math.max(model.drawReg, 0.01)) * 1.06, 1.05), 60).toFixed(2))
      : 4;
    const homeOtOdds = model
      ? Number(Math.min(Math.max((1 / Math.max(model.homeWinOt, 0.005)) * 1.06, 1.05), 60).toFixed(2))
      : 12;
    const awayOtOdds = model
      ? Number(Math.min(Math.max((1 / Math.max(model.awayWinOt, 0.005)) * 1.06, 1.05), 60).toFixed(2))
      : 12;
    const otAddonOdds = (() => {
      if (!model) return { home: 2, away: 2 };
      const drawBase = Math.max(model.drawReg, 0.01);
      const pHomeGivenDraw = clamp(model.homeWinOt / drawBase, 0.02, 0.98);
      const pAwayGivenDraw = clamp(model.awayWinOt / drawBase, 0.02, 0.98);
      const twoWay = toTwoWayOdds(pHomeGivenDraw, pAwayGivenDraw);
      return { home: twoWay.aOdds, away: twoWay.bOdds };
    })();
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
      drawOdds,
      homeOtOdds,
      awayOtOdds,
      homeOtAddonOdds: otAddonOdds.home,
      awayOtAddonOdds: otAddonOdds.away,
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
    .map<MarketFixture | null>((model) => {
      const fixture = knockoutById.get(model.fixtureId);
      if (!fixture) return null;
      return {
        fixtureId: model.fixtureId,
        competition: "KNOCKOUT",
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
      drawOdds: 60,
      homeOtOdds: 60,
      awayOtOdds: 60,
        homeOtAddonOdds: 2,
        awayOtAddonOdds: 2,
        bttsYesOdds: toTwoWayOdds(0.5, 0.5).aOdds,
        bttsNoOdds: toTwoWayOdds(0.5, 0.5).bOdds,
        locked: fixture.homeGoals !== null && fixture.awayGoals !== null,
      };
    })
    .filter((entry): entry is MarketFixture => entry !== null);

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
  const { activeRound, markets: allMarkets, gauntletWinnerMarkets } = buildCurrentMarkets(
    fixtures,
    participants,
    allowGauntletBetting,
  );
  const participantId = resolveParticipantIdForDisplayName(displayName, participants);
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const markets = allMarkets.filter((market) => {
    if (!participantId) return true;
    const fixture = fixtureById.get(market.fixtureId);
    if (!fixture) return true;
    return fixture.homeParticipantId !== participantId && fixture.awayParticipantId !== participantId;
  });

  await ensureAccountsInitialized(activeRound);
  await applyWeeklyRewards(getLatestCompletedRound(fixtures));
  await settleOpenBets(fixtures, tournament.status);

  const accounts = await getAccounts();
  const account = accounts.find(
    (entry) => getDisplayNameKey(entry.participant_name) === getDisplayNameKey(displayName),
  );
  const balance = account?.balance ?? 100;
  const marketById = new Map(markets.map((market) => [market.fixtureId, market]));
  const gauntletWinnerId = getGauntletWinnerId(fixtures);
  const gauntletWinnerOddsByParticipantId = new Map(
    gauntletWinnerMarkets.map((market) => [market.participantId, market.odds]),
  );

  const bets = (await getBets()).filter(
    (bet) => getDisplayNameKey(bet.participant_name) === getDisplayNameKey(displayName),
  );
  const openBets = bets
    .filter((bet) => bet.status === "OPEN")
    .map((bet) => {
      const selections = parseSelections(bet.selections);
      const totalLegs = selections.length;
      let legsResolved = 0;
      let deadBet = false;
      let unresolvedProbProduct = 1;
      let hasLiveLeg = false;
      const selectionView = selections.map((selection) => {
        const fixture = selection.fixtureId ? fixtureById.get(selection.fixtureId) : undefined;
        const market = selection.fixtureId ? marketById.get(selection.fixtureId) : undefined;
        const home = market?.homeName ?? "Home";
        const away = market?.awayName ?? "Away";
        const winnerName =
          selection.side === "GAUNTLET_WINNER"
            ? participants.find((entry) => entry.id === selection.participantId)?.displayName
            : undefined;

        if (fixture && isLiveForCashout(fixture)) {
          hasLiveLeg = true;
        }
        const result = selectionResult(selection, fixtureById, bet.created_at, tournament.status, gauntletWinnerId);
        if (result === "WON") {
          legsResolved += 1;
        } else if (result === "LOST") {
          legsResolved += 1;
          deadBet = true;
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
          odds:
            typeof selection.placedOdds === "number" && Number.isFinite(selection.placedOdds)
              ? selection.placedOdds
              : market
                ? sideOdds(market, selection, gauntletWinnerOddsByParticipantId)
                : undefined,
          result,
        };
      });

      const { potentialReturn, offer } = computeConservativeCashout(
        bet.stake,
        Number(bet.odds),
        deadBet ? 0 : unresolvedProbProduct,
        legsResolved,
        totalLegs,
      );
      const hasStartedLeg = legsResolved > 0 || hasLiveLeg;
      const preKickFullStake = !deadBet && !hasStartedLeg;
      const canCashOut = preKickFullStake
        ? true
        : !deadBet && !hasLiveLeg && offer >= 1 && legsResolved > 0 && legsResolved < totalLegs;
      return {
        id: bet.id,
        stake: bet.stake,
        odds: Number(bet.odds),
        potentialReturn,
        selections: selectionView,
        cashOutOffer: canCashOut ? (preKickFullStake ? bet.stake : offer) : null,
        canCashOut,
        shareText: buildShareText(bet.id, bet.created_at, selectionView, bet.stake, Number(bet.odds), potentialReturn),
        createdAt: bet.created_at.toISOString(),
      };
    });

  const settledBets = bets
    .filter((bet) => bet.status !== "OPEN")
    .slice(0, 20)
    .map((bet) => {
      const selections = parseSelections(bet.selections);
      const selectionView = selections.map((selection) => {
        const market = selection.fixtureId ? marketById.get(selection.fixtureId) : undefined;
        const home = market?.homeName ?? "Home";
        const away = market?.awayName ?? "Away";
        const winnerName =
          selection.side === "GAUNTLET_WINNER"
            ? participants.find((entry) => entry.id === selection.participantId)?.displayName
            : undefined;
        const result = selectionResult(selection, fixtureById, bet.created_at, tournament.status, gauntletWinnerId);
        return {
          fixtureId: selection.fixtureId,
          side: selection.side,
          line: selection.line,
          participantId: selection.participantId,
          label: sideLabel(selection.side, getDisplayName(home), getDisplayName(away), selection.line, winnerName),
          odds:
            typeof selection.placedOdds === "number" && Number.isFinite(selection.placedOdds)
              ? selection.placedOdds
              : market
                ? sideOdds(market, selection, gauntletWinnerOddsByParticipantId)
                : undefined,
          result,
        };
      });
      return {
        id: bet.id,
        stake: bet.stake,
        odds: Number(bet.odds),
        status: bet.status as "WON" | "LOST",
        returnPoints: bet.return_points ?? 0,
        settledAt: bet.settled_at?.toISOString() ?? null,
        selections: selectionView,
      };
    });

  const byName = new Map(
    participants.map((participant) => [getDisplayNameKey(participant.displayName), participant]),
  );
  const leaderboard = accounts
    .map((entry) => ({
      displayName: entry.participant_name,
      balance: entry.balance,
      primaryColor: byName.get(getDisplayNameKey(entry.participant_name))?.primaryColor,
      secondaryColor: byName.get(getDisplayNameKey(entry.participant_name))?.secondaryColor,
    }))
    .sort((a, b) => b.balance - a.balance || a.displayName.localeCompare(b.displayName));

  const rewardNotice = activeRound
    ? `Each completed GameWeek from GW${account?.reward_start_round ?? activeRound} onward adds +10 points.`
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
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const participantId = resolveParticipantIdForDisplayName(displayName, participants);
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const gauntletWinnerOddsByParticipantId = new Map(
    state.gauntletWinnerMarkets.map((entry) => [entry.participantId, entry.odds]),
  );
  let totalOdds = 1;
  const normalizedSelections: BetSelection[] = [];
  const seen = new Set<string>();
  const outcomeByFixture = new Map<string, "HOME_WIN" | "AWAY_WIN" | "DRAW_REG" | "HOME_WIN_OT" | "AWAY_WIN_OT">();
  const teamGoalsUsageByFixture = new Map<string, { home: boolean; away: boolean }>();
  const goalsDirectionByFixture = new Map<string, Set<string>>();
  const goalSelectionsByFixture = new Map<string, Array<{ side: BetSide; line?: number }>>();
  let hasGauntletWinnerSelection = false;

  for (const rawSelection of selections) {
    const selection = normalizedSelection(rawSelection);
    if (selection.side === "BTTS_YES" || selection.side === "BTTS_NO") {
      return {
        ok: false as const,
        error: "BTTS market is currently disabled. Please use match result and goals markets.",
      };
    }
    const key = `${selection.fixtureId ?? selection.participantId ?? ""}:${selection.side}:${selection.line ?? ""}`;
    if (seen.has(key)) continue;
    if (selection.side === "GAUNTLET_WINNER") {
      if (hasGauntletWinnerSelection) {
        return { ok: false as const, error: "Only one Gauntlet winner selection is allowed per slip." };
      }
      hasGauntletWinnerSelection = true;
    }

    if (selection.fixtureId) {
      if (
        selection.side === "HOME_WIN" ||
        selection.side === "AWAY_WIN" ||
        selection.side === "DRAW_REG"
      ) {
        const existing = outcomeByFixture.get(selection.fixtureId);
        if (existing && existing !== selection.side) {
          return { ok: false as const, error: "Only one match outcome selection is allowed per fixture." };
        }
        outcomeByFixture.set(selection.fixtureId, selection.side);
      }
      if (selection.side === "HOME_WIN_OT" || selection.side === "AWAY_WIN_OT") {
        const existing = outcomeByFixture.get(selection.fixtureId);
        if (existing && existing !== "DRAW_REG") {
          return {
            ok: false as const,
            error: "OT winner add-on requires a draw selection and cannot be combined with home/away win.",
          };
        }
      }
      if (
        selection.side === "HOME_GOALS_OVER" ||
        selection.side === "HOME_GOALS_UNDER" ||
        selection.side === "AWAY_GOALS_OVER" ||
        selection.side === "AWAY_GOALS_UNDER"
      ) {
        const usage = teamGoalsUsageByFixture.get(selection.fixtureId) ?? { home: false, away: false };
        if (selection.side === "HOME_GOALS_OVER" || selection.side === "HOME_GOALS_UNDER") usage.home = true;
        if (selection.side === "AWAY_GOALS_OVER" || selection.side === "AWAY_GOALS_UNDER") usage.away = true;
        teamGoalsUsageByFixture.set(selection.fixtureId, usage);
      }
      const goalsKey = (() => {
        if (selection.side === "MATCH_GOALS_OVER") return "MATCH_OVER";
        if (selection.side === "MATCH_GOALS_UNDER") return "MATCH_UNDER";
        if (selection.side === "HOME_GOALS_OVER") return "HOME_OVER";
        if (selection.side === "HOME_GOALS_UNDER") return "HOME_UNDER";
        if (selection.side === "AWAY_GOALS_OVER") return "AWAY_OVER";
        if (selection.side === "AWAY_GOALS_UNDER") return "AWAY_UNDER";
        return null;
      })();
      if (goalsKey) {
        const goalSelections = goalSelectionsByFixture.get(selection.fixtureId) ?? [];
        goalSelections.push({ side: selection.side, line: selection.line });
        goalSelectionsByFixture.set(selection.fixtureId, goalSelections);
        const existing = goalsDirectionByFixture.get(selection.fixtureId) ?? new Set<string>();
        if (existing.has(goalsKey)) {
          const marketName = goalsKey.startsWith("MATCH")
            ? "match goals"
            : goalsKey.startsWith("HOME")
              ? "home team goals"
              : "away team goals";
          const directionName = goalsKey.endsWith("OVER") ? "Over" : "Under";
          return {
            ok: false as const,
            error: `Only one ${directionName} selection is allowed for ${marketName} in the same match.`,
          };
        }
        existing.add(goalsKey);
        goalsDirectionByFixture.set(selection.fixtureId, existing);
      }
    }

    if (selection.side === "GAUNTLET_WINNER") {
      if (!selection.participantId || !gauntletWinnerOddsByParticipantId.has(selection.participantId)) {
        return { ok: false as const, error: "Invalid Gauntlet winner selection." };
      }
      const legOdds = sideOdds(null, selection, gauntletWinnerOddsByParticipantId);
      totalOdds *= legOdds;
      selection.placedOdds = legOdds;
    } else {
      if (participantId && selection.fixtureId) {
        const fixture = fixtureById.get(selection.fixtureId);
        if (fixture && (fixture.homeParticipantId === participantId || fixture.awayParticipantId === participantId)) {
          return { ok: false as const, error: "You cannot bet on a fixture involving your own team." };
        }
      }
      const market = selection.fixtureId ? marketById.get(selection.fixtureId) : undefined;
      if (!market) return { ok: false as const, error: "Selection is outside available fixtures." };
      if (market.locked) return { ok: false as const, error: "One of your selected fixtures is already complete." };
      let oddsForSelection = sideOdds(market, selection, gauntletWinnerOddsByParticipantId);
      if (selection.side === "HOME_WIN" || selection.side === "AWAY_WIN") {
        const impliedWinner = guaranteedWinnerFromGoalSelections(
          goalSelectionsByFixture.get(selection.fixtureId) ?? [],
        );
        if (impliedWinner === selection.side) {
          oddsForSelection = 1;
        }
      }
      if (
        (selection.side === "MATCH_GOALS_UNDER" ||
          selection.side === "HOME_GOALS_UNDER" ||
          selection.side === "AWAY_GOALS_UNDER") &&
        oddsForSelection <= 1.02
      ) {
        return {
          ok: false as const,
          error: "Under slider selections at 1/50 or shorter are blocked.",
        };
      }
      totalOdds *= oddsForSelection;
      selection.placedOdds = oddsForSelection;
    }
    seen.add(key);
    normalizedSelections.push(selection);
  }
  if (normalizedSelections.length === 0) return { ok: false as const, error: "No valid selections." };
  const byFixtureSelections = new Map<string, Set<BetSide>>();
  for (const selection of normalizedSelections) {
    if (!selection.fixtureId) continue;
    const set = byFixtureSelections.get(selection.fixtureId) ?? new Set<BetSide>();
    set.add(selection.side);
    byFixtureSelections.set(selection.fixtureId, set);
  }
  for (const [fixtureId, set] of byFixtureSelections.entries()) {
    if ((set.has("HOME_WIN_OT") || set.has("AWAY_WIN_OT")) && !set.has("DRAW_REG")) {
      return {
        ok: false as const,
        error: "Select Draw first before adding an OT winner for that fixture.",
      };
    }
    if ((set.has("HOME_WIN_OT") || set.has("AWAY_WIN_OT")) && (set.has("HOME_WIN") || set.has("AWAY_WIN"))) {
      return {
        ok: false as const,
        error: "OT winner add-on cannot be combined with direct home/away win for the same fixture.",
      };
    }
    if (set.has("HOME_WIN_OT") && set.has("AWAY_WIN_OT")) {
      return {
        ok: false as const,
        error: "Choose only one OT winner add-on per fixture.",
      };
    }

    const goalSelectionsForFixture = normalizedSelections.filter(
      (selection) =>
        selection.fixtureId === fixtureId &&
        (selection.side === "MATCH_GOALS_OVER" ||
          selection.side === "MATCH_GOALS_UNDER" ||
          selection.side === "HOME_GOALS_OVER" ||
          selection.side === "HOME_GOALS_UNDER" ||
          selection.side === "AWAY_GOALS_OVER" ||
          selection.side === "AWAY_GOALS_UNDER"),
    );
    if (!areGoalSelectionsFeasible(goalSelectionsForFixture)) {
      return {
        ok: false as const,
        error: "One or more goals selections conflict with each other for the same fixture.",
      };
    }
  }

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

export async function reconcileGamblingAfterFixtureUpdate() {
  const { tournament, participants, fixtures } = await getTournamentDataReadOnly();
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const leagueComplete = leagueFixtures.length > 0 && leagueFixtures.every(isCompleted);
  const allowGauntletBetting =
    leagueComplete && (tournament.status === "KNOCKOUT" || tournament.status === "COMPLETE");
  const { activeRound } = buildCurrentMarkets(fixtures, participants, allowGauntletBetting);
  await ensureAccountsInitialized(activeRound);
  await applyWeeklyRewards(getLatestCompletedRound(fixtures));
  await settleOpenBets(fixtures, tournament.status);
}
