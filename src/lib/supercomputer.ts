import type { Fixture, FixtureResultKind, Participant } from "@prisma/client";
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

export type BettingMarketModel = {
  fixtureId: string;
  round: number;
  lambdaHome: number;
  lambdaAway: number;
  homeWinReg: number;
  drawReg: number;
  awayWinReg: number;
  bttsYes: number;
  bttsNo: number;
  over55: number;
  under55: number;
};

export type GauntletMatchMarketModel = {
  fixtureId: string;
  round: number;
  homeParticipantId: string;
  awayParticipantId: string;
  lambdaHome: number;
  lambdaAway: number;
  homeWin: number;
  awayWin: number;
};

export type GauntletWinnerChance = {
  participantId: string;
  chance: number;
};

type VenueProfile = {
  games: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

type TeamProfiles = {
  home: VenueProfile;
  away: VenueProfile;
};

/** Ordered key: home was at home vs away. */
type PairwiseHomeKey = `${string}|${string}`;

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

/** Standard normal via Box–Muller (used for partial pooling / early-season uncertainty). */
function normal01(rand: () => number) {
  const u = Math.max(rand(), 1e-9);
  const v = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Epistemic noise scale: high when few results are in, tightens as the schedule fills in
 * (similar spirit to Glicko-style uncertainty decay and hierarchical shrinkage in club models).
 */
function epistemicSigma(completedLeagueMatches: number, pendingLeagueMatches: number) {
  const denom = Math.max(1, completedLeagueMatches + pendingLeagueMatches);
  const progress = clamp(completedLeagueMatches / denom, 0, 1);
  return clamp(0.36 * Math.exp(-2.4 * progress) + 0.07, 0.07, 0.36);
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

function emptyVenue(): VenueProfile {
  return { games: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function addPointsForResult(
  homeGoals: number,
  awayGoals: number,
  overtimeWinner: "HOME" | "AWAY" | null,
  resultKind: FixtureResultKind,
): { homePts: number; awayPts: number } {
  if (resultKind === "DOUBLE_FORFEIT") return { homePts: 0, awayPts: 0 };
  if (resultKind === "HOME_WALKOVER") return { homePts: 3, awayPts: 0 };
  if (resultKind === "AWAY_WALKOVER") return { homePts: 0, awayPts: 3 };
  if (homeGoals > awayGoals) {
    if (overtimeWinner === "HOME") return { homePts: 2, awayPts: 1 };
    return { homePts: 3, awayPts: 0 };
  }
  if (homeGoals < awayGoals) {
    if (overtimeWinner === "AWAY") return { homePts: 1, awayPts: 2 };
    return { homePts: 0, awayPts: 3 };
  }
  return { homePts: 1, awayPts: 1 };
}

/**
 * Deterministic RNG seed from all completed visible results so every new score
 * shifts the entire Monte Carlo distribution.
 */
function seedFromCompletedFixtures(fixtures: Fixture[]) {
  const source = fixtures
    .filter(isCompleted)
    .map(
      (fixture) =>
        `${fixture.id}:${fixture.round}:${fixture.homeParticipantId}:${fixture.awayParticipantId}:${fixture.homeGoals}:${fixture.awayGoals}:${fixture.overtimeWinner ?? "n"}:${fixture.resultKind}`,
    )
    .sort()
    .join("|");
  return hashSeed(source || "empty");
}

function poissonPmf(k: number, lambda: number) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0) return 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) p *= lambda / i;
  return p;
}

/**
 * Regulation scoreline distribution (mutually exclusive, sums to 1).
 * "draw" = tied goals (typically goes to OT in this league); simulations still apply OT.
 */
function regulationTrinomialFromPoisson(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals = 22,
) {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;

  for (let h = 0; h <= maxGoals; h += 1) {
    const ph = poissonPmf(h, lambdaHome);
    for (let a = 0; a <= maxGoals; a += 1) {
      const pa = poissonPmf(a, lambdaAway);
      const joint = ph * pa;
      if (h > a) pHome += joint;
      else if (h < a) pAway += joint;
      else pDraw += joint;
    }
  }

  const sum = pHome + pDraw + pAway;
  if (sum <= 0) return { homeWin: 1 / 3, draw: 1 / 3, awayWin: 1 / 3 };
  return { homeWin: pHome / sum, draw: pDraw / sum, awayWin: pAway / sum };
}

function totalsAndBttsFromPoisson(lambdaHome: number, lambdaAway: number, maxGoals = 22) {
  let bttsYes = 0;
  let over55 = 0;
  for (let h = 0; h <= maxGoals; h += 1) {
    const ph = poissonPmf(h, lambdaHome);
    for (let a = 0; a <= maxGoals; a += 1) {
      const pa = poissonPmf(a, lambdaAway);
      const joint = ph * pa;
      if (h > 0 && a > 0) bttsYes += joint;
      if (h + a > 5) over55 += joint;
    }
  }
  const bttsNo = Math.max(0, 1 - bttsYes);
  const under55 = Math.max(0, 1 - over55);
  const bttsSum = bttsYes + bttsNo;
  const totalsSum = over55 + under55;
  return {
    bttsYes: bttsSum > 0 ? bttsYes / bttsSum : 0.5,
    bttsNo: bttsSum > 0 ? bttsNo / bttsSum : 0.5,
    over55: totalsSum > 0 ? over55 / totalsSum : 0.5,
    under55: totalsSum > 0 ? under55 / totalsSum : 0.5,
  };
}

function buildProfilesAndBaselines(
  participants: Participant[],
  completed: Fixture[],
): {
  profiles: Map<string, TeamProfiles>;
  pairwiseHome: Map<PairwiseHomeKey, { n: number; sumHomeMargin: number }>;
  leagueMeanHome: number;
  leagueMeanAway: number;
  shrink: number;
} {
  const profiles = new Map<string, TeamProfiles>();
  for (const p of participants) {
    profiles.set(p.id, { home: emptyVenue(), away: emptyVenue() });
  }

  const pairwiseHome = new Map<PairwiseHomeKey, { n: number; sumHomeMargin: number }>();

  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  let matchCount = 0;

  for (const fixture of completed) {
    if (fixture.homeGoals === null || fixture.awayGoals === null) continue;
    const rk = fixture.resultKind ?? "NORMAL";
    if (rk === "DOUBLE_FORFEIT") continue;

    const homeProfile = profiles.get(fixture.homeParticipantId);
    const awayProfile = profiles.get(fixture.awayParticipantId);
    if (!homeProfile || !awayProfile) continue;

    const hg = fixture.homeGoals;
    const ag = fixture.awayGoals;
    totalHomeGoals += hg;
    totalAwayGoals += ag;
    matchCount += 1;

    homeProfile.home.games += 1;
    homeProfile.home.goalsFor += hg;
    homeProfile.home.goalsAgainst += ag;
    awayProfile.away.games += 1;
    awayProfile.away.goalsFor += ag;
    awayProfile.away.goalsAgainst += hg;

    const { homePts, awayPts } = addPointsForResult(hg, ag, fixture.overtimeWinner, rk);
    homeProfile.home.points += homePts;
    awayProfile.away.points += awayPts;

    const key = `${fixture.homeParticipantId}|${fixture.awayParticipantId}` as PairwiseHomeKey;
    const prev = pairwiseHome.get(key) ?? { n: 0, sumHomeMargin: 0 };
    prev.n += 1;
    prev.sumHomeMargin += hg - ag;
    pairwiseHome.set(key, prev);
  }

  const leagueMeanHome = matchCount > 0 ? totalHomeGoals / matchCount : 3.2;
  const leagueMeanAway = matchCount > 0 ? totalAwayGoals / matchCount : 3.0;
  /** Stronger pull to league-average rates when few games have been played (early-season humility). */
  const shrink = clamp(4.0 + matchCount * 0.028, 4.0, 10);

  return { profiles, pairwiseHome, leagueMeanHome, leagueMeanAway, shrink };
}

function relativeRate(numerator: number, denomGames: number, leagueRate: number, shrink: number) {
  return (numerator + shrink * leagueRate) / (denomGames + shrink) / leagueRate;
}

function estimateLambdas(
  homeId: string,
  awayId: string,
  profiles: Map<string, TeamProfiles>,
  leagueMeanHome: number,
  leagueMeanAway: number,
  shrink: number,
  pairwiseHome: Map<PairwiseHomeKey, { n: number; sumHomeMargin: number }>,
  overallRatingDiff: number,
): { lambdaHome: number; lambdaAway: number; otHomeBias: number } {
  const h = profiles.get(homeId)!;
  const a = profiles.get(awayId)!;

  const attHome = relativeRate(h.home.goalsFor, h.home.games, leagueMeanHome, shrink);
  const defHome = relativeRate(h.home.goalsAgainst, h.home.games, leagueMeanAway, shrink);
  const attAway = relativeRate(a.away.goalsFor, a.away.games, leagueMeanAway, shrink);
  const defAway = relativeRate(a.away.goalsAgainst, a.away.games, leagueMeanHome, shrink);

  let lambdaHome = leagueMeanHome * attHome * defAway;
  let lambdaAway = leagueMeanAway * attAway * defHome;

  const directKey = `${homeId}|${awayId}` as PairwiseHomeKey;
  const reverseKey = `${awayId}|${homeId}` as PairwiseHomeKey;
  const direct = pairwiseHome.get(directKey);
  const reverse = pairwiseHome.get(reverseKey);

  let h2hMargin = 0;
  let h2hWeight = 0;
  if (direct && direct.n > 0) {
    h2hMargin += direct.sumHomeMargin / direct.n;
    h2hWeight += direct.n;
  }
  if (reverse && reverse.n > 0) {
    h2hMargin += -(reverse.sumHomeMargin / reverse.n);
    h2hWeight += reverse.n;
  }
  if (h2hWeight > 0) {
    const adj = (h2hMargin / h2hWeight) * 0.22;
    lambdaHome = clamp(lambdaHome * Math.exp(adj * 0.35), 0.35, 14);
    lambdaAway = clamp(lambdaAway * Math.exp(-adj * 0.35), 0.35, 14);
  }

  lambdaHome = clamp(lambdaHome, 0.45, 14);
  lambdaAway = clamp(lambdaAway, 0.45, 14);

  const homeVenuePpg = h.home.games > 0 ? h.home.points / h.home.games : 1.2;
  const awayVenuePpg = a.away.games > 0 ? a.away.points / a.away.games : 1.0;
  const otHomeBias = clamp(
    (homeVenuePpg - awayVenuePpg) * 0.12 + overallRatingDiff * 0.08,
    -0.55,
    0.55,
  );

  return { lambdaHome, lambdaAway, otHomeBias };
}

function sortProjectedRows(
  rows: Array<{ participantId: string; points: number; goalDifference: number; goalsFor: number }>,
  rand: () => number,
) {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return rand() < 0.5 ? -1 : 1;
  });
}

function applySimulatedResult(
  home: SimRow,
  away: SimRow,
  homeGoals: number,
  awayGoals: number,
  overtimeWinner: "HOME" | "AWAY" | null,
) {
  home.goalsFor += homeGoals;
  home.goalsAgainst += awayGoals;
  away.goalsFor += awayGoals;
  away.goalsAgainst += homeGoals;

  const { homePts, awayPts } = addPointsForResult(homeGoals, awayGoals, overtimeWinner, "NORMAL");
  home.points += homePts;
  away.points += awayPts;
}

function samplePoisson(rand: () => number, lambda: number, maxK = 24) {
  let cdf = 0;
  const r = rand();
  for (let k = 0; k <= maxK; k += 1) {
    cdf += poissonPmf(k, lambda);
    if (r <= cdf) return k;
  }
  return maxK;
}

function applyHistoricalFixture(home: SimRow, away: SimRow, fixture: Fixture) {
  if (fixture.homeGoals === null || fixture.awayGoals === null) return;
  const rk = fixture.resultKind ?? "NORMAL";
  const hg = fixture.homeGoals;
  const ag = fixture.awayGoals;

  if (rk === "DOUBLE_FORFEIT") {
    home.goalsFor += 0;
    home.goalsAgainst += 20;
    away.goalsFor += 0;
    away.goalsAgainst += 20;
    home.points += 0;
    away.points += 0;
    return;
  }

  home.goalsFor += hg;
  home.goalsAgainst += ag;
  away.goalsFor += ag;
  away.goalsAgainst += hg;
  const { homePts, awayPts } = addPointsForResult(hg, ag, fixture.overtimeWinner, rk);
  home.points += homePts;
  away.points += awayPts;
}

function sampleMatch(
  rand: () => number,
  lambdaHome: number,
  lambdaAway: number,
  otHomeBias: number,
): { homeGoals: number; awayGoals: number; overtimeWinner: "HOME" | "AWAY" | null } {
  const h = samplePoisson(rand, lambdaHome);
  const a = samplePoisson(rand, lambdaAway);

  if (h === a) {
    const pOtHome = clamp(0.5 + otHomeBias * 0.35, 0.22, 0.78);
    const ot = rand() < pOtHome ? "HOME" : "AWAY";
    return { homeGoals: h, awayGoals: a, overtimeWinner: ot };
  }
  return { homeGoals: h, awayGoals: a, overtimeWinner: null };
}

function estimateMatchWinProbability(
  homeId: string,
  awayId: string,
  profiles: Map<string, TeamProfiles>,
  leagueMeanHome: number,
  leagueMeanAway: number,
  shrink: number,
  pairwiseHome: Map<PairwiseHomeKey, { n: number; sumHomeMargin: number }>,
  ratingById: Map<string, number>,
) {
  const ratingDiff = (ratingById.get(homeId) ?? 0) - (ratingById.get(awayId) ?? 0);
  const rates = estimateLambdas(
    homeId,
    awayId,
    profiles,
    leagueMeanHome,
    leagueMeanAway,
    shrink,
    pairwiseHome,
    ratingDiff,
  );
  const reg = regulationTrinomialFromPoisson(rates.lambdaHome, rates.lambdaAway);
  return {
    lambdaHome: rates.lambdaHome,
    lambdaAway: rates.lambdaAway,
    homeWin: clamp(reg.homeWin + reg.draw * 0.5, 0.02, 0.98),
    awayWin: clamp(reg.awayWin + reg.draw * 0.5, 0.02, 0.98),
  };
}

export function runSupercomputer(
  participants: Participant[],
  fixtures: Fixture[],
  iterations = 10000,
): {
  maxVisibleRound: number;
  fixturePredictions: FixturePrediction[];
  tableProjections: TableProjection[];
  modelInfo: {
    completedLeagueMatches: number;
    remainingLeagueFixturesSimulated: number;
    epistemicSigma: number;
  };
} {
  const allLeagueFixtures = fixtures
    .filter((fixture) => fixture.phase === "LEAGUE")
    .sort((a, b) => (a.round !== b.round ? a.round - b.round : a.createdAt.getTime() - b.createdAt.getTime()));
  const completed = allLeagueFixtures.filter(isCompleted);
  const pending = allLeagueFixtures.filter((fixture) => !isCompleted(fixture));

  const { profiles, pairwiseHome, leagueMeanHome, leagueMeanAway, shrink } = buildProfilesAndBaselines(
    participants,
    completed,
  );

  const epSigma = epistemicSigma(completed.length, pending.length);

  const baseTable = computeLeagueTable(participants, completed);
  const ratingById = new Map<string, number>();
  for (const row of baseTable) {
    const played = Math.max(row.played, 1);
    ratingById.set(row.participantId, row.points / played + row.goalDifference * 0.04);
  }
  for (const p of participants) {
    if (!ratingById.has(p.id)) ratingById.set(p.id, 1);
  }

  const fixturePredictions = pending.map((fixture) => {
    const diff =
      (ratingById.get(fixture.homeParticipantId) ?? 0) - (ratingById.get(fixture.awayParticipantId) ?? 0);
    const rates = estimateLambdas(
      fixture.homeParticipantId,
      fixture.awayParticipantId,
      profiles,
      leagueMeanHome,
      leagueMeanAway,
      shrink,
      pairwiseHome,
      diff,
    );
    const probabilities = regulationTrinomialFromPoisson(rates.lambdaHome, rates.lambdaAway);
    return {
      fixtureId: fixture.id,
      homeWin: probabilities.homeWin,
      draw: probabilities.draw,
      awayWin: probabilities.awayWin,
    };
  });

  const pendingMeta = pending.map((fixture, index) => {
    const diff =
      (ratingById.get(fixture.homeParticipantId) ?? 0) - (ratingById.get(fixture.awayParticipantId) ?? 0);
    const { lambdaHome, lambdaAway, otHomeBias } = estimateLambdas(
      fixture.homeParticipantId,
      fixture.awayParticipantId,
      profiles,
      leagueMeanHome,
      leagueMeanAway,
      shrink,
      pairwiseHome,
      diff,
    );
    return { fixture, prediction: fixturePredictions[index], lambdaHome, lambdaAway, otHomeBias };
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
    if (!home || !away) continue;
    applyHistoricalFixture(home, away, fixture);
  }

  const rand = mulberry32(seedFromCompletedFixtures(allLeagueFixtures));

  for (let run = 0; run < iterations; run += 1) {
    const rows = new Map<string, SimRow>();
    for (const [participantId, base] of baseRows.entries()) {
      rows.set(participantId, { ...base });
    }

    const teamZ = new Map<string, number>();
    for (const participant of participants) {
      teamZ.set(participant.id, normal01(rand) * epSigma);
    }
    const scoringNight = Math.exp(normal01(rand) * (0.045 + 0.035 * (1 - clamp(completed.length / Math.max(1, completed.length + pending.length), 0, 1))));

    for (const meta of pendingMeta) {
      const home = rows.get(meta.fixture.homeParticipantId);
      const away = rows.get(meta.fixture.awayParticipantId);
      if (!home || !away) continue;
      const zh = teamZ.get(meta.fixture.homeParticipantId) ?? 0;
      const za = teamZ.get(meta.fixture.awayParticipantId) ?? 0;
      const zDiff = zh - za;
      const lamH = clamp(meta.lambdaHome * Math.exp(zDiff * 0.48) * scoringNight, 0.25, 16);
      const lamA = clamp(meta.lambdaAway * Math.exp(-zDiff * 0.48) * scoringNight, 0.25, 16);
      const sampled = sampleMatch(rand, lamH, lamA, meta.otHomeBias);
      applySimulatedResult(home, away, sampled.homeGoals, sampled.awayGoals, sampled.overtimeWinner);
    }

    const projected = sortProjectedRows(
      [...rows.entries()].map(([participantId, row]) => ({
        participantId,
        points: row.points,
        goalDifference: row.goalsFor - row.goalsAgainst,
        goalsFor: row.goalsFor,
      })),
      rand,
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
    modelInfo: {
      completedLeagueMatches: completed.length,
      remainingLeagueFixturesSimulated: pending.length,
      epistemicSigma: epSigma,
    },
  };
}

export function buildCurrentRoundBettingMarkets(
  participants: Participant[],
  fixtures: Fixture[],
): { activeRound: number | null; markets: BettingMarketModel[] } {
  const visibleLeagueFixtures = getVisibleLeagueFixtures(fixtures).sort(
    (a, b) => (a.round !== b.round ? a.round - b.round : a.createdAt.getTime() - b.createdAt.getTime()),
  );
  const rounds = [...new Set(visibleLeagueFixtures.map((fixture) => fixture.round))].sort((a, b) => a - b);
  const activeRound =
    rounds.find((round) =>
      visibleLeagueFixtures
        .filter((fixture) => fixture.round === round)
        .some((fixture) => fixture.homeGoals === null || fixture.awayGoals === null),
    ) ?? rounds[rounds.length - 1] ?? null;
  if (activeRound === null) return { activeRound: null, markets: [] };

  const completedLeagueFixtures = fixtures
    .filter((fixture) => fixture.phase === "LEAGUE" && fixture.homeGoals !== null && fixture.awayGoals !== null)
    .sort((a, b) => (a.round !== b.round ? a.round - b.round : a.createdAt.getTime() - b.createdAt.getTime()));

  const { profiles, pairwiseHome, leagueMeanHome, leagueMeanAway, shrink } = buildProfilesAndBaselines(
    participants,
    completedLeagueFixtures,
  );
  const baseTable = computeLeagueTable(participants, completedLeagueFixtures);
  const ratingById = new Map<string, number>();
  for (const row of baseTable) {
    const played = Math.max(row.played, 1);
    ratingById.set(row.participantId, row.points / played + row.goalDifference * 0.04);
  }
  for (const participant of participants) {
    if (!ratingById.has(participant.id)) ratingById.set(participant.id, 1);
  }

  const roundFixtures = visibleLeagueFixtures.filter((fixture) => fixture.round === activeRound);
  const markets = roundFixtures.map<BettingMarketModel>((fixture) => {
    const ratingDiff =
      (ratingById.get(fixture.homeParticipantId) ?? 0) - (ratingById.get(fixture.awayParticipantId) ?? 0);
    const rates = estimateLambdas(
      fixture.homeParticipantId,
      fixture.awayParticipantId,
      profiles,
      leagueMeanHome,
      leagueMeanAway,
      shrink,
      pairwiseHome,
      ratingDiff,
    );
    const reg = regulationTrinomialFromPoisson(rates.lambdaHome, rates.lambdaAway);
    const specials = totalsAndBttsFromPoisson(rates.lambdaHome, rates.lambdaAway);
    return {
      fixtureId: fixture.id,
      round: fixture.round,
      lambdaHome: rates.lambdaHome,
      lambdaAway: rates.lambdaAway,
      homeWinReg: reg.homeWin,
      drawReg: reg.draw,
      awayWinReg: reg.awayWin,
      bttsYes: specials.bttsYes,
      bttsNo: specials.bttsNo,
      over55: specials.over55,
      under55: specials.under55,
    };
  });

  return { activeRound, markets };
}

export function buildGauntletBettingMarkets(
  participants: Participant[],
  fixtures: Fixture[],
  iterations = 12000,
): {
  matchMarkets: GauntletMatchMarketModel[];
  winnerChances: GauntletWinnerChance[];
} {
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const completedLeagueFixtures = leagueFixtures.filter(isCompleted);
  if (completedLeagueFixtures.length === 0) {
    return { matchMarkets: [], winnerChances: [] };
  }
  const knockoutFixtures = fixtures
    .filter((fixture) => fixture.phase === "KNOCKOUT")
    .sort((a, b) => (a.round !== b.round ? a.round - b.round : a.createdAt.getTime() - b.createdAt.getTime()));
  if (knockoutFixtures.length === 0) {
    return { matchMarkets: [], winnerChances: [] };
  }

  const table = computeLeagueTable(participants, completedLeagueFixtures);
  const seededIds = table.map((row) => row.participantId);
  if (seededIds.length < 2) return { matchMarkets: [], winnerChances: [] };

  const { profiles, pairwiseHome, leagueMeanHome, leagueMeanAway, shrink } = buildProfilesAndBaselines(
    participants,
    completedLeagueFixtures,
  );
  const ratingById = new Map<string, number>();
  for (const row of table) {
    const played = Math.max(row.played, 1);
    ratingById.set(row.participantId, row.points / played + row.goalDifference * 0.04);
  }
  const allIds = new Set(participants.map((entry) => entry.id));
  for (const id of allIds) {
    if (!ratingById.has(id)) ratingById.set(id, 1);
  }

  const rounds = Math.max(0, seededIds.length - 1);
  const fixtureByRound = new Map(knockoutFixtures.map((fixture) => [fixture.round, fixture]));

  const matchMarkets: GauntletMatchMarketModel[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const fixture = fixtureByRound.get(round);
    if (!fixture || isCompleted(fixture)) continue;
    const homeId = fixture.homeParticipantId;
    const awayId = fixture.awayParticipantId;
    if (!homeId || !awayId) continue;
    const oddsModel = estimateMatchWinProbability(
      homeId,
      awayId,
      profiles,
      leagueMeanHome,
      leagueMeanAway,
      shrink,
      pairwiseHome,
      ratingById,
    );
    matchMarkets.push({
      fixtureId: fixture.id,
      round: fixture.round,
      homeParticipantId: homeId,
      awayParticipantId: awayId,
      lambdaHome: oddsModel.lambdaHome,
      lambdaAway: oddsModel.lambdaAway,
      homeWin: oddsModel.homeWin,
      awayWin: oddsModel.awayWin,
    });
  }

  const championCounts = new Map<string, number>();
  for (const id of seededIds) championCounts.set(id, 0);
  const rand = mulberry32(seedFromCompletedFixtures(fixtures) ^ hashSeed("gauntlet-outright"));

  for (let run = 0; run < Math.max(1000, iterations); run += 1) {
    let carryWinner: string | null = null;
    for (let round = 1; round <= rounds; round += 1) {
      const homeSeedIndex = seededIds.length - 1 - round;
      const roundHome = seededIds[homeSeedIndex];
      const fixture = fixtureByRound.get(round);
      const roundAway: string | null = round === 1 ? (seededIds[seededIds.length - 1] ?? null) : carryWinner;
      if (!roundHome || !roundAway) {
        carryWinner = roundHome ?? roundAway ?? null;
        continue;
      }
      if (fixture && isCompleted(fixture)) {
        const winner =
          fixture.homeGoals! > fixture.awayGoals!
            ? fixture.homeParticipantId
            : fixture.awayGoals! > fixture.homeGoals!
              ? fixture.awayParticipantId
              : fixture.overtimeWinner === "HOME"
                ? fixture.homeParticipantId
                : fixture.overtimeWinner === "AWAY"
                  ? fixture.awayParticipantId
                  : fixture.awayParticipantId;
        carryWinner = winner;
        continue;
      }

      const oddsModel = estimateMatchWinProbability(
        roundHome,
        roundAway,
        profiles,
        leagueMeanHome,
        leagueMeanAway,
        shrink,
        pairwiseHome,
        ratingById,
      );
      carryWinner = rand() < oddsModel.homeWin ? roundHome : roundAway;
    }
    if (carryWinner) {
      championCounts.set(carryWinner, (championCounts.get(carryWinner) ?? 0) + 1);
    }
  }

  const simRuns = Math.max(1000, iterations);
  const winnerChances = seededIds
    .map((participantId) => ({
      participantId,
      chance: (championCounts.get(participantId) ?? 0) / simRuns,
    }))
    .sort((a, b) => b.chance - a.chance);

  return { matchMarkets, winnerChances };
}
