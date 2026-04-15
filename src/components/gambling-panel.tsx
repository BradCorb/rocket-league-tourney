"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TeamName } from "@/components/team-name";

type MarketFixture = {
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
  bttsYesOdds: number;
  bttsNoOdds: number;
  locked: boolean;
};

type BetSide =
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
  | "GAUNTLET_WINNER";

type StatePayload = {
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

type SlipSelection = {
  fixtureId?: string;
  side: BetSide;
  line?: number;
  participantId?: string;
  label: string;
  odds: number;
};

const sideLabel: Record<BetSide, string> = {
  HOME_WIN: "Home win",
  AWAY_WIN: "Away win",
  DRAW_REG: "Draw in regulation",
  HOME_WIN_OT: "Home win in OT",
  AWAY_WIN_OT: "Away win in OT",
  BTTS_YES: "BTTS Yes",
  BTTS_NO: "BTTS No",
  MATCH_GOALS_OVER: "Match goals over",
  MATCH_GOALS_UNDER: "Match goals under",
  HOME_GOALS_OVER: "Home goals over",
  HOME_GOALS_UNDER: "Home goals under",
  AWAY_GOALS_OVER: "Away goals over",
  AWAY_GOALS_UNDER: "Away goals under",
  GAUNTLET_WINNER: "Gauntlet winner",
};

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function formatFractionalOdds(decimalOdds: number): string {
  const safeDecimal = Number.isFinite(decimalOdds) ? Math.max(1.01, decimalOdds) : 2;
  const target = safeDecimal - 1;
  const preferredDenominators = [1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 15, 20, 23, 25, 30] as const;
  const minTarget = 1 / 100;
  const boundedTarget = Math.max(minTarget, target);

  let bestN = 1;
  let bestD = 1;
  let bestErr = Number.POSITIVE_INFINITY;

  for (const d of preferredDenominators) {
    for (let n = 1; n <= 25; n += 1) {
      const approx = n / d;
      const err = Math.abs(boundedTarget - approx);
      if (err < bestErr) {
        bestErr = err;
        bestN = n;
        bestD = d;
      }
    }
  }

  // Very short prices are commonly shown as 1/x.
  if (boundedTarget < 0.2) {
    return `1/${Math.max(2, Math.round(1 / boundedTarget))}`;
  }

  // Long prices are commonly rounded to x/1.
  if (boundedTarget > 7.5) {
    return `${Math.max(8, Math.round(boundedTarget))}/1`;
  }

  const divisor = gcd(bestN, bestD);
  const reducedN = Math.max(1, Math.round(bestN / divisor));
  const reducedD = Math.max(1, Math.round(bestD / divisor));

  // Avoid awkward fractions like 97/16 by snapping to cleaner whole-number style.
  if (reducedN > 25 && reducedD > 1) {
    if (boundedTarget >= 1) return `${Math.max(1, Math.round(boundedTarget))}/1`;
    return `1/${Math.max(2, Math.round(1 / boundedTarget))}`;
  }

  return `${reducedN}/${reducedD}`;
}

function fractionalToDecimal(fractional: string): number {
  const [numRaw, denRaw] = fractional.split("/");
  const numerator = Number(numRaw);
  const denominator = Number(denRaw);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 1;
  }
  return 1 + numerator / denominator;
}

function poissonPmf(k: number, lambda: number) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) p *= lambda / i;
  return p;
}

function probabilityOver(lambda: number, line: number) {
  const threshold = Math.floor(line);
  let sum = 0;
  for (let goals = 0; goals <= threshold; goals += 1) sum += poissonPmf(goals, lambda);
  return Math.max(0.0001, Math.min(0.9999, 1 - sum));
}

function toTwoWayOdds(probA: number, probB: number) {
  const total = Math.max(probA + probB, 1e-9);
  const baseA = probA / total;
  const baseB = probB / total;
  const overround = 1.06;
  const impliedA = Math.max(baseA * overround, 0.03);
  const impliedB = Math.max(baseB * overround, 0.03);
  return {
    aOdds: Math.min(Math.max(1 / impliedA, 1.05), 60),
    bOdds: Math.min(Math.max(1 / impliedB, 1.05), 60),
  };
}

function selectionOdds(market: MarketFixture, side: BetSide, line?: number) {
  if (side === "HOME_WIN") return market.homeOdds;
  if (side === "AWAY_WIN") return market.awayOdds;
  if (side === "DRAW_REG") return market.drawOdds;
  if (side === "HOME_WIN_OT") return market.homeOtOdds;
  if (side === "AWAY_WIN_OT") return market.awayOtOdds;
  if (side === "BTTS_YES") return market.bttsYesOdds;
  if (side === "BTTS_NO") return market.bttsNoOdds;
  if (side === "MATCH_GOALS_OVER") {
    const pOver = probabilityOver(market.lambdaHome + market.lambdaAway, line ?? 5);
    return toTwoWayOdds(pOver, 1 - pOver).aOdds;
  }
  if (side === "MATCH_GOALS_UNDER") {
    const pOver = probabilityOver(market.lambdaHome + market.lambdaAway, line ?? 5);
    return toTwoWayOdds(pOver, 1 - pOver).bOdds;
  }
  if (side === "HOME_GOALS_OVER") {
    const pOver = probabilityOver(market.lambdaHome, line ?? 0);
    return toTwoWayOdds(pOver, 1 - pOver).aOdds;
  }
  if (side === "HOME_GOALS_UNDER") {
    const pOver = probabilityOver(market.lambdaHome, line ?? 0);
    return toTwoWayOdds(pOver, 1 - pOver).bOdds;
  }
  if (side === "AWAY_GOALS_OVER") {
    const pOver = probabilityOver(market.lambdaAway, line ?? 0);
    return toTwoWayOdds(pOver, 1 - pOver).aOdds;
  }
  const pOver = probabilityOver(market.lambdaAway, line ?? 0);
  return toTwoWayOdds(pOver, 1 - pOver).bOdds;
}

export function GamblingPanel() {
  const [data, setData] = useState<StatePayload | null>(null);
  const [status, setStatus] = useState("");
  const [slipStake, setSlipStake] = useState(10);
  const [slipSelections, setSlipSelections] = useState<SlipSelection[]>([]);
  const [totalGoalLineByFixture, setTotalGoalLineByFixture] = useState<Record<string, number>>({});
  const [homeGoalLineByFixture, setHomeGoalLineByFixture] = useState<Record<string, number>>({});
  const [awayGoalLineByFixture, setAwayGoalLineByFixture] = useState<Record<string, number>>({});
  function hasSelection(
    fixtureId: string,
    sides: BetSide[],
  ) {
    return slipSelections.some(
      (entry) => entry.fixtureId === fixtureId && sides.includes(entry.side),
    );
  }

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  async function loadState() {
    const response = await fetch("/api/gambling/state", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as StatePayload;
    setData(payload);
  }

  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await fetch("/api/gambling/state", { cache: "no-store" });
      if (!response.ok || !active) return;
      const payload = (await response.json()) as StatePayload;
      if (!active) return;
      setData(payload);
    };
    void load();
    const interval = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  function addSelection(market: MarketFixture, side: BetSide, line?: number) {
    const normalizedLine =
      side === "MATCH_GOALS_OVER" ||
      side === "MATCH_GOALS_UNDER" ||
      side === "HOME_GOALS_OVER" ||
      side === "HOME_GOALS_UNDER" ||
      side === "AWAY_GOALS_OVER" ||
      side === "AWAY_GOALS_UNDER"
        ? Math.floor(Math.max(0, Math.min(25, line ?? 0)))
        : undefined;
    const key = `${market.fixtureId}:${side}:${normalizedLine ?? ""}`;
    setSlipSelections((prev) => {
      if (prev.some((entry) => `${entry.fixtureId}:${entry.side}:${entry.line ?? ""}` === key)) return prev;
      const label = normalizedLine === undefined
        ? `${market.homeName} vs ${market.awayName} · ${sideLabel[side]}`
        : `${market.homeName} vs ${market.awayName} · ${sideLabel[side]} ${normalizedLine}`;
      return [
        ...prev,
        {
          fixtureId: market.fixtureId,
          side,
          line: normalizedLine,
          label,
          odds: selectionOdds(market, side, normalizedLine),
        },
      ];
    });
    setStatus("Selection added to bet slip.");
  }

  function addGauntletWinnerSelection(
    participantId: string,
    displayName: string,
    odds: number,
  ) {
    const key = `${participantId}:GAUNTLET_WINNER:`;
    setSlipSelections((prev) => {
      if (prev.some((entry) => `${entry.participantId ?? ""}:${entry.side}:${entry.line ?? ""}` === key)) return prev;
      return [
        ...prev,
        {
          side: "GAUNTLET_WINNER",
          participantId,
          label: `${displayName} to win the Gauntlet`,
          odds,
        },
      ];
    });
    setStatus("Gauntlet winner selection added.");
  }

  function removeSelection(fixtureId: string, side: BetSide, line?: number) {
    setSlipSelections((prev) =>
      prev.filter((entry) =>
        !(
          (entry.fixtureId ?? entry.participantId ?? "") === fixtureId &&
          entry.side === side &&
          (entry.line ?? -1) === (line ?? -1)
        )),
    );
  }

  const slipOdds = useMemo(
    () => (slipSelections.length === 0 ? 1 : slipSelections.reduce((product, selection) => product * selection.odds, 1)),
    [slipSelections],
  );
  const slipDisplayOdds = useMemo(() => formatFractionalOdds(slipOdds), [slipOdds]);
  const slipDisplayDecimalOdds = useMemo(() => fractionalToDecimal(slipDisplayOdds), [slipDisplayOdds]);

  async function placeSlipBet() {
    if (!data || slipSelections.length === 0) return;
    if (!Number.isFinite(slipStake) || slipStake <= 0) {
      setStatus("Stake must be above 0.");
      return;
    }
    setStatus("Placing bet slip...");
    const response = await fetch("/api/gambling/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ACCUM",
        stake: slipStake,
        selections: slipSelections.map((selection) => ({
          fixtureId: selection.fixtureId,
          side: selection.side,
          line: selection.line,
          participantId: selection.participantId,
        })),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setStatus(response.ok ? "Bet slip placed." : payload.error ?? "Unable to place bet slip.");
    if (response.ok) setSlipSelections([]);
    await loadState();
  }

  async function cashOutBet(betId: string) {
    setStatus("Processing cash out...");
    const response = await fetch("/api/gambling/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "CASH_OUT", betId }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setStatus(response.ok ? "Cash out completed." : payload.error ?? "Unable to cash out.");
    await loadState();
  }

  async function shareSlip(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Bet slip copied. Paste it anywhere (including chat).");
    } catch {
      setStatus("Unable to copy bet slip.");
    }
  }

  async function shareSlipImage(bet: StatePayload["openBets"][number]) {
    const lines = [
      "Rocket League Bet Slip",
      "",
      ...bet.selections.map((selection, index) => `${index + 1}. ${selection.label}`),
      "",
      `Stake: ${bet.stake} pts`,
      `Odds: ${formatFractionalOdds(bet.odds)}`,
      `Potential Return: ${bet.potentialReturn} pts`,
    ];
    const width = 1100;
    const lineHeight = 38;
    const padding = 48;
    const height = padding * 2 + lines.length * lineHeight + 24;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setStatus("Unable to generate image.");
      return;
    }

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#061525");
    gradient.addColorStop(1, "#111827");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(34, 211, 238, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, width - 28, height - 28);

    ctx.fillStyle = "#e5f3ff";
    ctx.font = "bold 34px Inter, Arial, sans-serif";
    let y = padding + 8;
    for (const line of lines) {
      if (line.startsWith("Rocket League")) {
        ctx.fillStyle = "#67e8f9";
        ctx.font = "bold 40px Inter, Arial, sans-serif";
      } else if (line === "") {
        y += lineHeight * 0.4;
        continue;
      } else {
        ctx.fillStyle = "#e5f3ff";
        ctx.font = "600 30px Inter, Arial, sans-serif";
      }
      ctx.fillText(line, padding, y);
      y += lineHeight;
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      setStatus("Unable to generate image.");
      return;
    }

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setStatus("Bet slip image copied to clipboard.");
        return;
      }
    } catch {
      // Fallback to download when clipboard image isn't allowed.
    }

    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `bet-slip-${bet.id}.png`;
    anchor.click();
    URL.revokeObjectURL(href);
    setStatus("Bet slip image downloaded.");
  }

  const anyOpenMarket = Boolean(data?.markets.some((market) => !market.locked));
  const hasActiveSlip = slipSelections.length > 0;
  const hasGauntletWinnerInSlip = slipSelections.some((selection) => selection.side === "GAUNTLET_WINNER");
  const canPlaceSlip = hasActiveSlip && Number.isFinite(slipStake) && slipStake > 0;

  return (
    <div className={`space-y-5 ${hasActiveSlip ? "pb-80" : ""}`}>
      <section className="surface-card p-4">
        <p className="text-sm font-semibold">Available points: {data?.balance ?? "-"}</p>
        <p className="muted mt-1 text-xs">{data?.rewardNotice ?? "Loading..."}</p>
        <p className="muted mt-1 text-xs">
          Betting GameWeek: {data?.activeRound ?? "-"} · Status: {anyOpenMarket ? "Open" : "Closed"}
        </p>
      </section>

      <section className="surface-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Match Markets</h3>
        <div className="mt-3 space-y-2">
          {(data?.markets ?? []).map((market) => (
            <article key={market.fixtureId} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
              {(() => {
                const hasHomeWin = hasSelection(market.fixtureId, ["HOME_WIN"]);
                const hasAwayWin = hasSelection(market.fixtureId, ["AWAY_WIN"]);
                const hasDrawReg = hasSelection(market.fixtureId, ["DRAW_REG"]);
                const hasHomeWinOt = hasSelection(market.fixtureId, ["HOME_WIN_OT"]);
                const hasAwayWinOt = hasSelection(market.fixtureId, ["AWAY_WIN_OT"]);
                const hasAnyOutcome =
                  hasHomeWin || hasAwayWin || hasDrawReg || hasHomeWinOt || hasAwayWinOt;
                const hasBttsYes = hasSelection(market.fixtureId, ["BTTS_YES"]);
                const hasBttsNo = hasSelection(market.fixtureId, ["BTTS_NO"]);
                const hasMatchOver = hasSelection(market.fixtureId, ["MATCH_GOALS_OVER"]);
                const hasMatchUnder = hasSelection(market.fixtureId, ["MATCH_GOALS_UNDER"]);
                const hasHomeOver = hasSelection(market.fixtureId, ["HOME_GOALS_OVER"]);
                const hasHomeUnder = hasSelection(market.fixtureId, ["HOME_GOALS_UNDER"]);
                const hasAwayOver = hasSelection(market.fixtureId, ["AWAY_GOALS_OVER"]);
                const hasAwayUnder = hasSelection(market.fixtureId, ["AWAY_GOALS_UNDER"]);
                const matchLine = totalGoalLineByFixture[market.fixtureId] ?? 5;
                const homeLine = homeGoalLineByFixture[market.fixtureId] ?? 2;
                const awayLine = awayGoalLineByFixture[market.fixtureId] ?? 2;
                const matchOverOdds = formatFractionalOdds(selectionOdds(market, "MATCH_GOALS_OVER", matchLine));
                const matchUnderOdds = formatFractionalOdds(selectionOdds(market, "MATCH_GOALS_UNDER", matchLine));
                const homeOverOdds = formatFractionalOdds(selectionOdds(market, "HOME_GOALS_OVER", homeLine));
                const homeUnderOdds = formatFractionalOdds(selectionOdds(market, "HOME_GOALS_UNDER", homeLine));
                const awayOverOdds = formatFractionalOdds(selectionOdds(market, "AWAY_GOALS_OVER", awayLine));
                const awayUnderOdds = formatFractionalOdds(selectionOdds(market, "AWAY_GOALS_UNDER", awayLine));
                return (
                  <>
              <p className="muted text-[10px] uppercase tracking-widest">
                {market.competition === "LEAGUE" ? `GameWeek ${market.round}` : `Gauntlet Round ${market.round}`}
              </p>
              <p className="font-semibold">
                <TeamName
                  name={market.homeName}
                  primaryColor={market.homePrimaryColor}
                  secondaryColor={market.homeSecondaryColor}
                />{" "}
                ({formatFractionalOdds(market.homeOdds)}) vs{" "}
                <TeamName
                  name={market.awayName}
                  primaryColor={market.awayPrimaryColor}
                  secondaryColor={market.awaySecondaryColor}
                />{" "}
                ({formatFractionalOdds(market.awayOdds)})
              </p>
              {market.competition === "LEAGUE" ? (
                <p className="muted mt-1 text-xs">
                  BTTS Yes {formatFractionalOdds(market.bttsYesOdds)} · BTTS No {formatFractionalOdds(market.bttsNoOdds)}
                </p>
              ) : (
                <p className="muted mt-1 text-xs">Gauntlet winner market (match result)</p>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "HOME_WIN")} disabled={market.locked || hasAnyOutcome}>
                  Home win {formatFractionalOdds(market.homeOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "AWAY_WIN")} disabled={market.locked || hasAnyOutcome}>
                  Away win {formatFractionalOdds(market.awayOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "DRAW_REG")} disabled={market.locked || hasAnyOutcome}>
                  Draw {formatFractionalOdds(market.drawOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "HOME_WIN_OT")} disabled={market.locked || hasAnyOutcome}>
                  Home OT win {formatFractionalOdds(market.homeOtOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "AWAY_WIN_OT")} disabled={market.locked || hasAnyOutcome}>
                  Away OT win {formatFractionalOdds(market.awayOtOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "BTTS_YES")} disabled={market.locked || market.competition === "KNOCKOUT" || hasBttsNo || hasBttsYes}>
                  BTTS Yes {formatFractionalOdds(market.bttsYesOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "BTTS_NO")} disabled={market.locked || market.competition === "KNOCKOUT" || hasBttsYes || hasBttsNo}>
                  BTTS No {formatFractionalOdds(market.bttsNoOdds)}
                </button>
              </div>

              {market.competition === "LEAGUE" ? (
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <p className="muted">
                    Match goals line: {matchLine} · Over {matchOverOdds} · Under {matchUnderOdds}
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={25}
                    step={1}
                    value={matchLine}
                    onChange={(event) =>
                      setTotalGoalLineByFixture((prev) => ({ ...prev, [market.fixtureId]: Number(event.target.value) }))
                    }
                    disabled={market.locked}
                    className="w-full"
                  />
                  <div className="mt-1 flex gap-2">
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "MATCH_GOALS_OVER", matchLine)} disabled={market.locked || hasMatchOver}>
                      Over {matchLine} ({matchOverOdds})
                    </button>
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "MATCH_GOALS_UNDER", matchLine)} disabled={market.locked || hasMatchUnder}>
                      Under {matchLine} ({matchUnderOdds})
                    </button>
                  </div>
                </div>
                <div>
                  <p className="muted">
                    {market.homeName} goals line: {homeLine} · Over {homeOverOdds} · Under {homeUnderOdds}
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={25}
                    step={1}
                    value={homeLine}
                    onChange={(event) =>
                      setHomeGoalLineByFixture((prev) => ({ ...prev, [market.fixtureId]: Number(event.target.value) }))
                    }
                    disabled={market.locked}
                    className="w-full"
                  />
                  <div className="mt-1 flex gap-2">
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "HOME_GOALS_OVER", homeLine)} disabled={market.locked || hasHomeOver}>
                      {market.homeName} over {homeLine} ({homeOverOdds})
                    </button>
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "HOME_GOALS_UNDER", homeLine)} disabled={market.locked || hasHomeUnder}>
                      {market.homeName} under {homeLine} ({homeUnderOdds})
                    </button>
                  </div>
                </div>
                <div>
                  <p className="muted">
                    {market.awayName} goals line: {awayLine} · Over {awayOverOdds} · Under {awayUnderOdds}
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={25}
                    step={1}
                    value={awayLine}
                    onChange={(event) =>
                      setAwayGoalLineByFixture((prev) => ({ ...prev, [market.fixtureId]: Number(event.target.value) }))
                    }
                    disabled={market.locked}
                    className="w-full"
                  />
                  <div className="mt-1 flex gap-2">
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "AWAY_GOALS_OVER", awayLine)} disabled={market.locked || hasAwayOver}>
                      {market.awayName} over {awayLine} ({awayOverOdds})
                    </button>
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "AWAY_GOALS_UNDER", awayLine)} disabled={market.locked || hasAwayUnder}>
                      {market.awayName} under {awayLine} ({awayUnderOdds})
                    </button>
                  </div>
                </div>
              </div>
              ) : null}
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Gauntlet Winner Outright</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(data?.gauntletWinnerMarkets ?? []).map((entry) => (
            <article key={entry.participantId} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <TeamName
                  name={entry.displayName}
                  primaryColor={entry.primaryColor}
                  secondaryColor={entry.secondaryColor}
                />
                <span className="text-xs">{Math.round(entry.chance * 100)}%</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="muted text-xs">Odds {formatFractionalOdds(entry.odds)}</span>
                <button
                  type="button"
                  className="ghost-button rounded-md px-2 py-1 text-xs"
                  onClick={() => addGauntletWinnerSelection(entry.participantId, entry.displayName, entry.odds)}
                  disabled={hasGauntletWinnerInSlip}
                >
                  Add
                </button>
              </div>
            </article>
          ))}
          {data && data.gauntletWinnerMarkets.length === 0 ? (
            <p className="muted text-xs">Gauntlet outright opens once knockout fixtures are generated.</p>
          ) : null}
        </div>
      </section>

      {!hasActiveSlip ? (
        <section className="surface-card p-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest">Bet Slip</h3>
          <p className="muted mt-2 text-xs">Add selections from the market cards above to open a docked bet slip.</p>
        </section>
      ) : null}

      <section className="surface-card overflow-x-auto p-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Points Leaderboard</h3>
        <table className="mt-3 min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/15 text-cyan-100/90">
              <th className="p-2">Pos</th>
              <th className="p-2">Player</th>
              <th className="p-2">Points</th>
            </tr>
          </thead>
          <tbody>
            {(data?.leaderboard ?? []).map((row, index) => (
              <tr key={row.displayName} className="border-b border-white/10">
                <td className="p-2 font-bold">{index + 1}</td>
                <td className="p-2">
                  <TeamName
                    name={row.displayName}
                    primaryColor={row.primaryColor}
                    secondaryColor={row.secondaryColor}
                  />
                </td>
                <td className="p-2">{row.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="surface-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Your Open Bets</h3>
        <div className="mt-3 space-y-2">
          {(data?.openBets ?? []).map((bet) => (
            <article key={bet.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
              <p>
                Stake {bet.stake} · Odds {formatFractionalOdds(bet.odds)} · Return {bet.potentialReturn}
              </p>
              <p className="muted text-xs">{bet.selections.map((selection) => selection.label).join(" + ")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="ghost-button rounded-md px-2 py-1 text-xs"
                  onClick={() => void shareSlip(bet.shareText)}
                >
                  Share
                </button>
                <button
                  type="button"
                  className="ghost-button rounded-md px-2 py-1 text-xs"
                  onClick={() => void shareSlipImage(bet)}
                >
                  Share Image
                </button>
                <button
                  type="button"
                  className="neo-button rounded-md px-2 py-1 text-xs font-semibold"
                  onClick={() => void cashOutBet(bet.id)}
                  disabled={!bet.canCashOut}
                >
                  {bet.canCashOut && bet.cashOutOffer ? `Cash out ${bet.cashOutOffer}` : "Cash out unavailable"}
                </button>
              </div>
            </article>
          ))}
          {data && data.openBets.length === 0 ? <p className="muted text-sm">No open bets.</p> : null}
        </div>
      </section>

      <section className="surface-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Recent Settled Bets</h3>
        <div className="mt-3 space-y-2">
          {(data?.settledBets ?? []).map((bet) => (
            <article key={bet.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
              <p>
                {bet.status} · Stake {bet.stake} · Return {bet.returnPoints}
              </p>
              <p className="muted text-xs">Odds {formatFractionalOdds(bet.odds)}</p>
            </article>
          ))}
          {data && data.settledBets.length === 0 ? <p className="muted text-sm">No settled bets yet.</p> : null}
        </div>
      </section>

      {status ? <p className="muted text-xs">{status}</p> : null}

      {hasActiveSlip && mounted
        ? createPortal(
        <section className="fixed inset-x-0 bottom-0 z-50 border-t border-cyan-300/30 bg-slate-950/95 p-3 backdrop-blur">
          <div className="mx-auto w-full max-w-6xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-widest">Bet Slip (Docked)</h3>
              <button
                type="button"
                className="ghost-button rounded-md px-2 py-1 text-xs"
                onClick={() => {
                  setSlipSelections([]);
                  setStatus("Bet slip deleted.");
                }}
              >
                Delete slip
              </button>
            </div>
            <div className="max-h-28 space-y-2 overflow-y-auto pr-1">
              {slipSelections.map((selection) => (
                <div
                  key={`${selection.fixtureId ?? selection.participantId ?? ""}:${selection.side}:${selection.line ?? ""}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs"
                >
                  <span>
                    {selection.label} ({formatFractionalOdds(selection.odds)})
                  </span>
                  <button
                    type="button"
                    className="ghost-button rounded-md px-2 py-1"
                    onClick={() =>
                      removeSelection(selection.fixtureId ?? selection.participantId ?? "", selection.side, selection.line)}
                    aria-label="Remove selection"
                    title="Remove selection"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                value={slipStake}
                onChange={(event) => setSlipStake(Number(event.target.value))}
                className="rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm"
              />
              <span className="muted text-xs">Slip odds: {slipDisplayOdds}</span>
              <span className="muted text-xs">Potential return: {Math.round(slipStake * slipDisplayDecimalOdds)}</span>
              <button
                type="button"
                className="neo-button rounded-md px-3 py-2 text-sm font-semibold"
                onClick={() => void placeSlipBet()}
                disabled={!canPlaceSlip}
              >
                Place bet slip
              </button>
            </div>
          </div>
        </section>
        , document.body)
        : null}
    </div>
  );
}
