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
  homeOtAddonOdds: number;
  awayOtAddonOdds: number;
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

function displayGoalLine(line: number | undefined) {
  const base = Math.max(0, Math.floor(line ?? 0));
  return `${base}.5`;
}

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
    const denominator = Math.max(2, Math.round(1 / boundedTarget));
    // Display floor for ultra-short prices (used for non-slider markets too).
    return `1/${Math.min(50, denominator)}`;
  }

  // Long prices: round in clean bookmaker-style steps.
  // <80: steps of 2, 80-99: steps of 5, 100-499: steps of 25, >=500: steps of 50 (prefer rounding down).
  if (boundedTarget > 7.5) {
    // Hard display cap rule: only clamp to 1000/1 once raw odds exceed 1050/1.
    if (boundedTarget > 1050) return "1000/1";
    const roundedLong =
      boundedTarget >= 500
        ? Math.max(500, Math.floor(boundedTarget / 50) * 50)
        : boundedTarget >= 100
        ? Math.max(100, Math.floor(boundedTarget / 25) * 25)
        : boundedTarget >= 80
          ? Math.max(80, Math.floor(boundedTarget / 5) * 5)
          : Math.max(8, Math.floor(boundedTarget / 2) * 2);
    return `${roundedLong}/1`;
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
  // Lower floor so raw prices can exceed 1050/1 before display cap.
  const impliedA = Math.max(baseA * overround, 0.0005);
  const impliedB = Math.max(baseB * overround, 0.0005);
  return {
    aOdds: Math.min(Math.max(1 / impliedA, 1.05), 2001),
    bOdds: Math.min(Math.max(1 / impliedB, 1.05), 2001),
  };
}

function resultBadge(result: "PENDING" | "WON" | "LOST" | "VOID") {
  if (result === "WON") return { icon: "TICK", cls: "text-emerald-300" };
  if (result === "LOST") return { icon: "X", cls: "text-rose-300" };
  if (result === "VOID") return { icon: "VOID", cls: "text-amber-300" };
  return { icon: "PENDING", cls: "text-cyan-200/80" };
}

function selectionOdds(market: MarketFixture, side: BetSide, line?: number) {
  if (side === "HOME_WIN") return market.homeOdds;
  if (side === "AWAY_WIN") return market.awayOdds;
  if (side === "DRAW_REG") return market.drawOdds;
  if (side === "HOME_WIN_OT") return market.homeOtAddonOdds;
  if (side === "AWAY_WIN_OT") return market.awayOtAddonOdds;
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

function areGoalSelectionsFeasible(
  selections: Array<{ side: BetSide; line?: number }>,
) {
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

  if (homeMin > homeMax || awayMin > awayMax || matchMin > matchMax) return false;
  const totalMin = homeMin + awayMin;
  const totalMax = homeMax + awayMax;
  const feasibleMin = Math.max(totalMin, matchMin);
  const feasibleMax = Math.min(totalMax, matchMax);
  return feasibleMin <= feasibleMax;
}

export function GamblingPanel() {
  const [data, setData] = useState<StatePayload | null>(null);
  const [status, setStatus] = useState("");
  const [slipStakeInput, setSlipStakeInput] = useState("10");
  const slipStake = Number(slipStakeInput);
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

  function canAddGoalSelection(fixtureId: string, side: BetSide, line: number) {
    const existing = slipSelections
      .filter(
        (entry) =>
          entry.fixtureId === fixtureId &&
          (entry.side === "MATCH_GOALS_OVER" ||
            entry.side === "MATCH_GOALS_UNDER" ||
            entry.side === "HOME_GOALS_OVER" ||
            entry.side === "HOME_GOALS_UNDER" ||
            entry.side === "AWAY_GOALS_OVER" ||
            entry.side === "AWAY_GOALS_UNDER"),
      )
      .map((entry) => ({ side: entry.side, line: entry.line }));
    return areGoalSelectionsFeasible([...existing, { side, line }]);
  }

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
        : `${market.homeName} vs ${market.awayName} · ${sideLabel[side]} ${displayGoalLine(normalizedLine)}`;
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
      prev.filter((entry) => {
        const sameSelection =
          (entry.fixtureId ?? entry.participantId ?? "") === fixtureId &&
          entry.side === side &&
          (entry.line ?? -1) === (line ?? -1);
        if (sameSelection) return false;
        // OT selections are only valid as add-ons to a Draw selection.
        if (side === "DRAW_REG" && entry.fixtureId === fixtureId && (entry.side === "HOME_WIN_OT" || entry.side === "AWAY_WIN_OT")) {
          return false;
        }
        return true;
      }),
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

  async function renderSlipImageBlob(bet: StatePayload["openBets"][number]) {
    const placed = new Date(bet.createdAt).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const oddsFractional = formatFractionalOdds(bet.odds);
    const width = 1100;
    const padding = 44;
    const headerHeight = 120;
    const pickRowHeight = 88;
    const totalsHeight = 86;
    const footerHeight = 44;
    const picksHeight = Math.max(1, bet.selections.length) * pickRowHeight;
    const height = padding * 2 + headerHeight + picksHeight + totalsHeight + footerHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#061525");
    gradient.addColorStop(1, "#111827");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(34, 211, 238, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, width - 28, height - 28);

    const marketByFixture = new Map((data?.markets ?? []).map((market) => [market.fixtureId, market]));

    // Header
    const topY = padding;
    ctx.fillStyle = "#67e8f9";
    ctx.font = "800 40px Inter, Arial, sans-serif";
    ctx.fillText("BET SLIP", padding, topY + 40);
    ctx.fillStyle = "#cde8ff";
    ctx.font = "600 24px Inter, Arial, sans-serif";
    ctx.fillText(`${bet.selections.length} picks`, padding, topY + 76);
    ctx.fillStyle = "#e5f3ff";
    ctx.font = "700 30px Inter, Arial, sans-serif";
    ctx.fillText(`Odds ${oddsFractional}`, width - padding - 250, topY + 60);

    // Picks area
    for (const [index, selection] of bet.selections.entries()) {
      const market = selection.fixtureId ? marketByFixture.get(selection.fixtureId) : undefined;
      const homeColor = market?.homePrimaryColor ?? "#22d3ee";
      const awayColor = market?.awayPrimaryColor ?? "#a78bfa";
      const rowX = padding;
      const rowW = width - padding * 2;
      const rowY = topY + headerHeight + index * pickRowHeight;

      const rowGradient = ctx.createLinearGradient(rowX, rowY, rowX + rowW, rowY);
      rowGradient.addColorStop(0, `${homeColor}55`);
      rowGradient.addColorStop(1, `${awayColor}55`);
      ctx.fillStyle = "rgba(8, 16, 30, 0.9)";
      ctx.fillRect(rowX, rowY, rowW, pickRowHeight - 8);
      ctx.fillStyle = rowGradient;
      ctx.fillRect(rowX, rowY, 10, pickRowHeight - 8);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(rowX, rowY, rowW, pickRowHeight - 8);

      const labelParts = selection.label.split("·").map((part) => part.trim());
      const fixtureLine = labelParts[0] ?? selection.label;
      const marketLine = labelParts[1] ?? "";
      const pickOdds =
        typeof selection.odds === "number" && Number.isFinite(selection.odds) && selection.odds > 1
          ? formatFractionalOdds(selection.odds)
          : null;
      const badge = resultBadge(selection.result);

      ctx.fillStyle = "#e8f3ff";
      ctx.font = "700 24px Inter, Arial, sans-serif";
      ctx.fillText(`${index + 1}. ${fixtureLine}`, rowX + 20, rowY + 33);
      ctx.fillStyle = "#b8d8ff";
      ctx.font = "600 20px Inter, Arial, sans-serif";
      const marketWithOdds = pickOdds ? `${marketLine} @ ${pickOdds}` : marketLine;
      ctx.fillText(marketWithOdds, rowX + 20, rowY + 62);
      ctx.fillStyle = badge.cls.includes("emerald") ? "#86efac" : badge.cls.includes("rose") ? "#fda4af" : badge.cls.includes("amber") ? "#fcd34d" : "#93c5fd";
      ctx.font = "700 16px Inter, Arial, sans-serif";
      ctx.fillText(badge.icon, rowX + rowW - 90, rowY + 32);
    }

    // Totals
    const totalsY = topY + headerHeight + picksHeight + 8;
    ctx.fillStyle = "rgba(7, 21, 40, 0.92)";
    ctx.fillRect(padding, totalsY, width - padding * 2, totalsHeight);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    ctx.strokeRect(padding, totalsY, width - padding * 2, totalsHeight);
    ctx.fillStyle = "#e5f3ff";
    ctx.font = "700 27px Inter, Arial, sans-serif";
    ctx.fillText(`Stake ${bet.stake} pts`, padding + 24, totalsY + 38);
    ctx.fillText(`Return ${bet.potentialReturn} pts`, padding + 360, totalsY + 38);
    ctx.fillStyle = "#93c5fd";
    ctx.font = "700 25px Inter, Arial, sans-serif";
    ctx.fillText(`Odds ${oddsFractional}`, width - padding - 220, totalsY + 38);

    // Footer metadata (small)
    const footerY = totalsY + totalsHeight + 26;
    ctx.fillStyle = "rgba(191, 219, 254, 0.7)";
    ctx.font = "500 15px Inter, Arial, sans-serif";
    ctx.fillText(`Bet #${bet.id} · Placed ${placed}`, padding, footerY);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob;
  }

  async function saveSlipImage(bet: StatePayload["openBets"][number]) {
    const blob = await renderSlipImageBlob(bet);
    if (!blob) {
      setStatus("Unable to generate image.");
      return;
    }

    try {
      const file = new File([blob], `bet-slip-${bet.id}.png`, { type: "image/png" });
      if (navigator.share && "canShare" in navigator && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Rocket League Bet Slip",
          text: "Rocket League Bet Slip",
          files: [file],
        });
        setStatus("Image ready to save/share from your phone sheet.");
        return;
      }
    } catch {
      // Fall back to direct download below.
    }

    // Explicit save action: download image file.
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `bet-slip-${bet.id}.png`;
    anchor.click();
    URL.revokeObjectURL(href);
    setStatus("Bet image saved/download started.");
  }

  const anyOpenMarket = Boolean(data?.markets.some((market) => !market.locked));
  const hasActiveSlip = slipSelections.length > 0;
  const hasGauntletWinnerInSlip = slipSelections.some((selection) => selection.side === "GAUNTLET_WINNER");
  const slipSelectionCount = slipSelections.length;
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
                const hasDirectWinner = hasHomeWin || hasAwayWin;
                const canAddDraw = !hasDirectWinner && !hasDrawReg;
                const canAddHomeOt = hasDrawReg && !hasDirectWinner && !hasHomeWinOt && !hasAwayWinOt;
                const canAddAwayOt = hasDrawReg && !hasDirectWinner && !hasAwayWinOt && !hasHomeWinOt;
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
                const matchUnderTooShort = selectionOdds(market, "MATCH_GOALS_UNDER", matchLine) <= 1.02;
                const homeUnderTooShort = selectionOdds(market, "HOME_GOALS_UNDER", homeLine) <= 1.02;
                const awayUnderTooShort = selectionOdds(market, "AWAY_GOALS_UNDER", awayLine) <= 1.02;
                const canAddMatchOver = canAddGoalSelection(market.fixtureId, "MATCH_GOALS_OVER", matchLine);
                const canAddMatchUnder = canAddGoalSelection(market.fixtureId, "MATCH_GOALS_UNDER", matchLine);
                const canAddHomeOver = canAddGoalSelection(market.fixtureId, "HOME_GOALS_OVER", homeLine);
                const canAddHomeUnder = canAddGoalSelection(market.fixtureId, "HOME_GOALS_UNDER", homeLine);
                const canAddAwayOver = canAddGoalSelection(market.fixtureId, "AWAY_GOALS_OVER", awayLine);
                const canAddAwayUnder = canAddGoalSelection(market.fixtureId, "AWAY_GOALS_UNDER", awayLine);
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
                  Result + goals markets powered by the Supercomputer.
                </p>
              ) : (
                <p className="muted mt-1 text-xs">Gauntlet winner market (match result)</p>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "HOME_WIN")} disabled={market.locked || hasDirectWinner || hasDrawReg || hasHomeWinOt || hasAwayWinOt}>
                  Home win {formatFractionalOdds(market.homeOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "AWAY_WIN")} disabled={market.locked || hasDirectWinner || hasDrawReg || hasHomeWinOt || hasAwayWinOt}>
                  Away win {formatFractionalOdds(market.awayOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "DRAW_REG")} disabled={market.locked || !canAddDraw}>
                  Draw {formatFractionalOdds(market.drawOdds)}
                </button>
                {hasDrawReg ? (
                  <>
                    <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "HOME_WIN_OT")} disabled={market.locked || !canAddHomeOt}>
                      Home OT add-on {formatFractionalOdds(market.homeOtAddonOdds)}
                    </button>
                    <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "AWAY_WIN_OT")} disabled={market.locked || !canAddAwayOt}>
                      Away OT add-on {formatFractionalOdds(market.awayOtAddonOdds)}
                    </button>
                  </>
                ) : null}
              </div>

              {market.competition === "LEAGUE" ? (
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <p className="muted">
                    Match goals line: {displayGoalLine(matchLine)} · Over {matchOverOdds} · Under {matchUnderOdds}
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
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "MATCH_GOALS_OVER", matchLine)} disabled={market.locked || hasMatchOver || !canAddMatchOver}>
                      Over {displayGoalLine(matchLine)} ({matchOverOdds})
                    </button>
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "MATCH_GOALS_UNDER", matchLine)} disabled={market.locked || hasMatchUnder || matchUnderTooShort || !canAddMatchUnder}>
                      Under {displayGoalLine(matchLine)} ({matchUnderOdds})
                    </button>
                  </div>
                </div>
                <div>
                  <p className="muted">
                    {market.homeName} goals line: {displayGoalLine(homeLine)} · Over {homeOverOdds} · Under {homeUnderOdds}
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
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "HOME_GOALS_OVER", homeLine)} disabled={market.locked || hasHomeOver || !canAddHomeOver}>
                      {market.homeName} over {displayGoalLine(homeLine)} ({homeOverOdds})
                    </button>
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "HOME_GOALS_UNDER", homeLine)} disabled={market.locked || hasHomeUnder || homeUnderTooShort || !canAddHomeUnder}>
                      {market.homeName} under {displayGoalLine(homeLine)} ({homeUnderOdds})
                    </button>
                  </div>
                </div>
                <div>
                  <p className="muted">
                    {market.awayName} goals line: {displayGoalLine(awayLine)} · Over {awayOverOdds} · Under {awayUnderOdds}
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
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "AWAY_GOALS_OVER", awayLine)} disabled={market.locked || hasAwayOver || !canAddAwayOver}>
                      {market.awayName} over {displayGoalLine(awayLine)} ({awayOverOdds})
                    </button>
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "AWAY_GOALS_UNDER", awayLine)} disabled={market.locked || hasAwayUnder || awayUnderTooShort || !canAddAwayUnder}>
                      {market.awayName} under {displayGoalLine(awayLine)} ({awayUnderOdds})
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
              <p className="text-xs text-cyan-100/85">
                Bet #{bet.id} · {new Date(bet.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
              </p>
              <p className="mt-1">
                Stake {bet.stake} · Odds {formatFractionalOdds(bet.odds)} · Return {bet.potentialReturn}
              </p>
              <p className="muted mt-1 text-xs">Full slip ({bet.selections.length} selection{bet.selections.length === 1 ? "" : "s"})</p>
              <div className="mt-2 space-y-1 rounded-md border border-white/10 bg-black/30 p-2">
                {bet.selections.map((selection, index) => {
                  const badge = resultBadge(selection.result);
                  return (
                    <p key={`${bet.id}-${index}`} className={`text-xs ${badge.cls} leading-relaxed`}>
                      {index + 1}. {badge.icon} {selection.label}
                    </p>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="ghost-button rounded-md px-2 py-1 text-xs"
                  onClick={() => void saveSlipImage(bet)}
                >
                  Share
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
                {bet.status === "WON" ? "Bet won" : "Bet lost"} · Stake {bet.stake} · Return {bet.returnPoints}
              </p>
              <p className="muted text-xs">Odds {formatFractionalOdds(bet.odds)}</p>
              <div className="mt-1 space-y-1">
                {bet.selections.map((selection, index) => {
                  const badge = resultBadge(selection.result);
                  return (
                    <p key={`${bet.id}-settled-${index}`} className={`text-xs ${badge.cls}`}>
                      {badge.icon} {selection.label}
                    </p>
                  );
                })}
              </div>
            </article>
          ))}
          {data && data.settledBets.length === 0 ? <p className="muted text-sm">No settled bets yet.</p> : null}
        </div>
      </section>

      {status ? <p className="muted text-xs">{status}</p> : null}

      {hasActiveSlip && typeof document !== "undefined"
        ? createPortal(
        <section className="fixed inset-x-0 bottom-0 z-50 border-t border-cyan-300/30 bg-slate-950/95 p-3 backdrop-blur">
          <div className="mx-auto w-full max-w-6xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-widest">Bet Slip ({slipSelectionCount})</h3>
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
            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
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
                value={slipStakeInput}
                onChange={(event) => setSlipStakeInput(event.target.value)}
                className="rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm"
              />
              <span className="muted text-xs">Balance: {data?.balance ?? "-"} pts</span>
              <span className="muted text-xs">Slip odds: {slipDisplayOdds}</span>
              <span className="muted text-xs">
                Potential return: {Math.round((Number.isFinite(slipStake) ? slipStake : 0) * slipDisplayDecimalOdds)}
              </span>
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
