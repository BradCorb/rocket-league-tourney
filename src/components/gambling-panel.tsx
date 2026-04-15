"use client";

import { useEffect, useMemo, useState } from "react";
import { TeamName } from "@/components/team-name";

type MarketFixture = {
  fixtureId: string;
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

type BetSide =
  | "HOME_WIN"
  | "AWAY_WIN"
  | "BTTS_YES"
  | "BTTS_NO"
  | "MATCH_GOALS_OVER"
  | "MATCH_GOALS_UNDER"
  | "HOME_GOALS_OVER"
  | "HOME_GOALS_UNDER"
  | "AWAY_GOALS_OVER"
  | "AWAY_GOALS_UNDER";

type StatePayload = {
  activeRound: number | null;
  balance: number;
  rewardNotice: string;
  markets: MarketFixture[];
  openBets: Array<{
    id: string;
    stake: number;
    odds: number;
    potentialReturn: number;
    selections: Array<{ fixtureId: string; side: BetSide; line?: number; label: string }>;
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
  fixtureId: string;
  side: BetSide;
  line?: number;
  label: string;
  odds: number;
};

const sideLabel: Record<BetSide, string> = {
  HOME_WIN: "Home win",
  AWAY_WIN: "Away win",
  BTTS_YES: "BTTS Yes",
  BTTS_NO: "BTTS No",
  MATCH_GOALS_OVER: "Match goals over",
  MATCH_GOALS_UNDER: "Match goals under",
  HOME_GOALS_OVER: "Home goals over",
  HOME_GOALS_UNDER: "Home goals under",
  AWAY_GOALS_OVER: "Away goals over",
  AWAY_GOALS_UNDER: "Away goals under",
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
  let bestN = 1;
  let bestD = 1;
  let bestErr = Number.POSITIVE_INFINITY;

  for (let d = 1; d <= 99; d += 1) {
    const n = Math.max(1, Math.min(99, Math.round(target * d)));
    const approx = n / d;
    const err = Math.abs(target - approx);
    if (err < bestErr) {
      bestErr = err;
      bestN = n;
      bestD = d;
    }
  }

  const divisor = gcd(bestN, bestD);
  const reducedN = Math.max(1, Math.round(bestN / divisor));
  const reducedD = Math.max(1, Math.round(bestD / divisor));
  if (reducedN > 99 || reducedD > 99) return "99/99";
  return `${reducedN}/${reducedD}`;
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
  }

  function removeSelection(fixtureId: string, side: BetSide, line?: number) {
    setSlipSelections((prev) =>
      prev.filter((entry) => !(entry.fixtureId === fixtureId && entry.side === side && (entry.line ?? -1) === (line ?? -1))),
    );
  }

  const slipOdds = useMemo(
    () => (slipSelections.length === 0 ? 1 : slipSelections.reduce((product, selection) => product * selection.odds, 1)),
    [slipSelections],
  );

  async function placeSlipBet() {
    if (!data || slipSelections.length === 0) return;
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

  const locked = Boolean(data?.markets.some((market) => market.locked));

  return (
    <div className="space-y-5">
      <section className="surface-card p-4">
        <p className="text-sm font-semibold">Available points: {data?.balance ?? "-"}</p>
        <p className="muted mt-1 text-xs">{data?.rewardNotice ?? "Loading..."}</p>
        <p className="muted mt-1 text-xs">
          Betting GameWeek: {data?.activeRound ?? "-"} · Status: {locked ? "Locked" : "Open"}
        </p>
      </section>

      <section className="surface-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Current GameWeek Markets</h3>
        <div className="mt-3 space-y-2">
          {(data?.markets ?? []).map((market) => (
            <article key={market.fixtureId} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
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
              <p className="muted mt-1 text-xs">
                BTTS Yes {formatFractionalOdds(market.bttsYesOdds)} · BTTS No {formatFractionalOdds(market.bttsNoOdds)}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "HOME_WIN")} disabled={locked}>
                  Home win {formatFractionalOdds(market.homeOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "AWAY_WIN")} disabled={locked}>
                  Away win {formatFractionalOdds(market.awayOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "BTTS_YES")} disabled={locked}>
                  BTTS Yes {formatFractionalOdds(market.bttsYesOdds)}
                </button>
                <button type="button" className="ghost-button rounded-md px-2 py-1 text-xs" onClick={() => addSelection(market, "BTTS_NO")} disabled={locked}>
                  BTTS No {formatFractionalOdds(market.bttsNoOdds)}
                </button>
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <p className="muted">Match goals line: {totalGoalLineByFixture[market.fixtureId] ?? 5}</p>
                  <input
                    type="range"
                    min={0}
                    max={25}
                    step={1}
                    value={totalGoalLineByFixture[market.fixtureId] ?? 5}
                    onChange={(event) =>
                      setTotalGoalLineByFixture((prev) => ({ ...prev, [market.fixtureId]: Number(event.target.value) }))
                    }
                    disabled={locked}
                    className="w-full"
                  />
                  <div className="mt-1 flex gap-2">
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "MATCH_GOALS_OVER", totalGoalLineByFixture[market.fixtureId] ?? 5)} disabled={locked}>
                      Over {totalGoalLineByFixture[market.fixtureId] ?? 5}
                    </button>
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "MATCH_GOALS_UNDER", totalGoalLineByFixture[market.fixtureId] ?? 5)} disabled={locked}>
                      Under {totalGoalLineByFixture[market.fixtureId] ?? 5}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="muted">{market.homeName} goals line: {homeGoalLineByFixture[market.fixtureId] ?? 2}</p>
                  <input
                    type="range"
                    min={0}
                    max={25}
                    step={1}
                    value={homeGoalLineByFixture[market.fixtureId] ?? 2}
                    onChange={(event) =>
                      setHomeGoalLineByFixture((prev) => ({ ...prev, [market.fixtureId]: Number(event.target.value) }))
                    }
                    disabled={locked}
                    className="w-full"
                  />
                  <div className="mt-1 flex gap-2">
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "HOME_GOALS_OVER", homeGoalLineByFixture[market.fixtureId] ?? 2)} disabled={locked}>
                      {market.homeName} over {homeGoalLineByFixture[market.fixtureId] ?? 2}
                    </button>
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "HOME_GOALS_UNDER", homeGoalLineByFixture[market.fixtureId] ?? 2)} disabled={locked}>
                      {market.homeName} under {homeGoalLineByFixture[market.fixtureId] ?? 2}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="muted">{market.awayName} goals line: {awayGoalLineByFixture[market.fixtureId] ?? 2}</p>
                  <input
                    type="range"
                    min={0}
                    max={25}
                    step={1}
                    value={awayGoalLineByFixture[market.fixtureId] ?? 2}
                    onChange={(event) =>
                      setAwayGoalLineByFixture((prev) => ({ ...prev, [market.fixtureId]: Number(event.target.value) }))
                    }
                    disabled={locked}
                    className="w-full"
                  />
                  <div className="mt-1 flex gap-2">
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "AWAY_GOALS_OVER", awayGoalLineByFixture[market.fixtureId] ?? 2)} disabled={locked}>
                      {market.awayName} over {awayGoalLineByFixture[market.fixtureId] ?? 2}
                    </button>
                    <button type="button" className="ghost-button rounded-md px-2 py-1" onClick={() => addSelection(market, "AWAY_GOALS_UNDER", awayGoalLineByFixture[market.fixtureId] ?? 2)} disabled={locked}>
                      {market.awayName} under {awayGoalLineByFixture[market.fixtureId] ?? 2}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card p-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Bet Slip</h3>
        <div className="space-y-2">
          {slipSelections.map((selection) => (
            <div
              key={`${selection.fixtureId}:${selection.side}:${selection.line ?? ""}`}
              className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs"
            >
              <span>
                {selection.label} ({formatFractionalOdds(selection.odds)})
              </span>
              <button
                type="button"
                className="ghost-button rounded-md px-2 py-1"
                onClick={() => removeSelection(selection.fixtureId, selection.side, selection.line)}
                disabled={locked}
              >
                Remove
              </button>
            </div>
          ))}
          {slipSelections.length === 0 ? <p className="muted text-xs">Add selections from the market cards above.</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            value={slipStake}
            onChange={(event) => setSlipStake(Number(event.target.value))}
            className="rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm"
            disabled={locked}
          />
          <span className="muted text-xs">Slip odds: {formatFractionalOdds(slipOdds)}</span>
          <span className="muted text-xs">Potential return: {Math.round(slipStake * slipOdds)}</span>
        </div>
        <button
          type="button"
          className="neo-button rounded-md px-3 py-2 text-sm font-semibold"
          onClick={() => void placeSlipBet()}
          disabled={locked || slipSelections.length === 0}
        >
          Place bet slip
        </button>
      </section>

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
    </div>
  );
}
