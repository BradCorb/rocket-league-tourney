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
  homeOdds: number;
  awayOdds: number;
  locked: boolean;
};

type StatePayload = {
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

export function GamblingPanel() {
  const [data, setData] = useState<StatePayload | null>(null);
  const [status, setStatus] = useState("");
  const [singleFixtureId, setSingleFixtureId] = useState("");
  const [singleSide, setSingleSide] = useState<"HOME" | "AWAY">("HOME");
  const [singleStake, setSingleStake] = useState(10);
  const [accumStake, setAccumStake] = useState(10);
  const [accumSelections, setAccumSelections] = useState<Record<string, "HOME" | "AWAY" | "">>({});

  async function loadState() {
    const response = await fetch("/api/gambling/state", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as StatePayload;
    setData(payload);
    if (payload.markets.length > 0 && !singleFixtureId) {
      setSingleFixtureId(payload.markets[0].fixtureId);
    }
  }

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const response = await fetch("/api/gambling/state", { cache: "no-store" });
      if (!response.ok || !mounted) return;
      const payload = (await response.json()) as StatePayload;
      if (!mounted) return;
      setData(payload);
      if (payload.markets.length > 0 && !singleFixtureId) {
        setSingleFixtureId(payload.markets[0].fixtureId);
      }
    };
    void load();
    const interval = window.setInterval(load, 15000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [singleFixtureId]);

  const selectedMarket = useMemo(
    () => data?.markets.find((market) => market.fixtureId === singleFixtureId) ?? null,
    [data, singleFixtureId],
  );

  const accumOdd = useMemo(() => {
    if (!data) return 1;
    const byId = new Map(data.markets.map((market) => [market.fixtureId, market]));
    const picked = Object.entries(accumSelections).filter(([, side]) => side === "HOME" || side === "AWAY");
    if (picked.length === 0) return 1;
    return picked.reduce((product, [fixtureId, side]) => {
      const market = byId.get(fixtureId);
      if (!market) return product;
      return product * (side === "HOME" ? market.homeOdds : market.awayOdds);
    }, 1);
  }, [data, accumSelections]);

  async function placeSingleBet() {
    if (!selectedMarket) return;
    setStatus("Placing single bet...");
    const response = await fetch("/api/gambling/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "SINGLE",
        fixtureId: selectedMarket.fixtureId,
        side: singleSide,
        stake: singleStake,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setStatus(response.ok ? "Single bet placed." : payload.error ?? "Unable to place single bet.");
    await loadState();
  }

  async function placeAccumulatorBet() {
    if (!data) return;
    const selections = Object.entries(accumSelections)
      .filter(([, side]) => side === "HOME" || side === "AWAY")
      .map(([fixtureId, side]) => ({ fixtureId, side: side as "HOME" | "AWAY" }));
    setStatus("Placing accumulator...");
    const response = await fetch("/api/gambling/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ACCUM",
        stake: accumStake,
        selections,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setStatus(response.ok ? "Accumulator placed." : payload.error ?? "Unable to place accumulator.");
    if (response.ok) setAccumSelections({});
    await loadState();
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
        <h3 className="text-sm font-semibold uppercase tracking-widest">Current GameWeek Winner Odds</h3>
        <div className="mt-3 space-y-2">
          {(data?.markets ?? []).map((market) => (
            <article key={market.fixtureId} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
              <p className="font-semibold">
                <TeamName
                  name={market.homeName}
                  primaryColor={market.homePrimaryColor}
                  secondaryColor={market.homeSecondaryColor}
                />{" "}
                ({market.homeOdds.toFixed(2)}) vs{" "}
                <TeamName
                  name={market.awayName}
                  primaryColor={market.awayPrimaryColor}
                  secondaryColor={market.awaySecondaryColor}
                />{" "}
                ({market.awayOdds.toFixed(2)})
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card p-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Single Bet</h3>
        <div className="grid gap-2 md:grid-cols-3">
          <select
            className="rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm"
            value={singleFixtureId}
            onChange={(event) => setSingleFixtureId(event.target.value)}
            disabled={locked}
          >
            {(data?.markets ?? []).map((market) => (
              <option key={market.fixtureId} value={market.fixtureId}>
                GW{market.round} · {market.homeName} vs {market.awayName}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm"
            value={singleSide}
            onChange={(event) => setSingleSide(event.target.value as "HOME" | "AWAY")}
            disabled={locked}
          >
            <option value="HOME">Home win ({selectedMarket?.homeOdds.toFixed(2) ?? "-"})</option>
            <option value="AWAY">Away win ({selectedMarket?.awayOdds.toFixed(2) ?? "-"})</option>
          </select>
          <input
            type="number"
            min={1}
            value={singleStake}
            onChange={(event) => setSingleStake(Number(event.target.value))}
            className="rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm"
            disabled={locked}
          />
        </div>
        <button
          type="button"
          className="neo-button rounded-md px-3 py-2 text-sm font-semibold"
          onClick={() => void placeSingleBet()}
          disabled={locked}
        >
          Place single
        </button>
      </section>

      <section className="surface-card p-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Accumulator (winners only)</h3>
        <div className="space-y-2">
          {(data?.markets ?? []).map((market) => (
            <div key={market.fixtureId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-52">
                <TeamName
                  name={market.homeName}
                  primaryColor={market.homePrimaryColor}
                  secondaryColor={market.homeSecondaryColor}
                />{" "}
                vs{" "}
                <TeamName
                  name={market.awayName}
                  primaryColor={market.awayPrimaryColor}
                  secondaryColor={market.awaySecondaryColor}
                />
              </span>
              <button
                type="button"
                className={`ghost-button rounded-md px-2 py-1 text-xs ${accumSelections[market.fixtureId] === "HOME" ? "leader-ring" : ""}`}
                onClick={() => setAccumSelections((prev) => ({ ...prev, [market.fixtureId]: prev[market.fixtureId] === "HOME" ? "" : "HOME" }))}
                disabled={locked}
              >
                Home {market.homeOdds.toFixed(2)}
              </button>
              <button
                type="button"
                className={`ghost-button rounded-md px-2 py-1 text-xs ${accumSelections[market.fixtureId] === "AWAY" ? "leader-ring" : ""}`}
                onClick={() => setAccumSelections((prev) => ({ ...prev, [market.fixtureId]: prev[market.fixtureId] === "AWAY" ? "" : "AWAY" }))}
                disabled={locked}
              >
                Away {market.awayOdds.toFixed(2)}
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            value={accumStake}
            onChange={(event) => setAccumStake(Number(event.target.value))}
            className="rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm"
            disabled={locked}
          />
          <span className="muted text-xs">Accum odds: {accumOdd.toFixed(2)}</span>
        </div>
        <button
          type="button"
          className="neo-button rounded-md px-3 py-2 text-sm font-semibold"
          onClick={() => void placeAccumulatorBet()}
          disabled={locked}
        >
          Place accumulator
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
                <td className="p-2">{row.displayName}</td>
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
              <p>Stake {bet.stake} · Odds {bet.odds.toFixed(2)}</p>
              <p className="muted text-xs">{bet.selections.map((selection) => selection.label).join(" + ")}</p>
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
              <p className="muted text-xs">Odds {bet.odds.toFixed(2)}</p>
            </article>
          ))}
          {data && data.settledBets.length === 0 ? <p className="muted text-sm">No settled bets yet.</p> : null}
        </div>
      </section>

      {status ? <p className="muted text-xs">{status}</p> : null}
    </div>
  );
}
