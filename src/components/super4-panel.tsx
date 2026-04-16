"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TeamName } from "@/components/team-name";

type PendingFixture = {
  id: string;
  round: number;
  home: string;
  away: string;
  homePrimaryColor?: string;
  homeSecondaryColor?: string;
  awayPrimaryColor?: string;
  awaySecondaryColor?: string;
  currentPick: { fixtureId: string; homeGoals: number; awayGoals: number } | null;
};

type Super4Payload = {
  displayName: string;
  competition: "LEAGUE" | "KNOCKOUT";
  points: number;
  exact: number;
  correctResult: number;
  activeRound: number | null;
  locked: boolean;
  revealPredictions: boolean;
  leaderboard: Array<{
    displayName: string;
    primaryColor?: string;
    secondaryColor?: string;
    points: number;
    exact: number;
    correctResult: number;
  }>;
  pendingFixtures: PendingFixture[];
};

export function Super4Panel() {
  const [data, setData] = useState<Super4Payload | null>(null);
  const [status, setStatus] = useState("");
  const [savingFixtureId, setSavingFixtureId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await fetch("/api/super4/picks", { cache: "no-store" });
      if (!response.ok || !active) return;
      const payload = (await response.json()) as Super4Payload;
      if (!active) return;
      setData(payload);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function savePick(fixtureId: string, homeGoals: number, awayGoals: number) {
    const fixture = data?.pendingFixtures.find((entry) => entry.id === fixtureId);
    setSavingFixtureId(fixtureId);
    setStatus("Saving...");
    const response = await fetch("/api/super4/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureId, homeGoals, awayGoals }),
    });
    setStatus(
      response.ok
        ? `Locked in: ${fixture?.home ?? "Home"} ${homeGoals}-${awayGoals} ${fixture?.away ?? "Away"}`
        : "Failed to save pick.",
    );
    const refresh = await fetch("/api/super4/picks", { cache: "no-store" });
    if (refresh.ok) {
      const payload = (await refresh.json()) as Super4Payload;
      setData(payload);
    }
    setSavingFixtureId(null);
  }

  async function logOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="space-y-4">
      <section className="surface-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">
            {data ? `${data.displayName} · Super 4 points: ${data.points}` : "Loading..."}
          </p>
          <button type="button" className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold" onClick={() => void logOut()}>
            Log out
          </button>
        </div>
        <p className="muted mt-2 text-xs">
          5 points exact score · 2 points correct result · 0 points wrong result.
        </p>
        {data ? (
          <p className="muted mt-1 text-xs">
            Active {data.competition === "LEAGUE" ? "GameWeek" : "Gauntlet Round"}: {data.activeRound ?? "-"} · Status:{" "}
            {data.locked ? "Locked (first result entered)" : "Open for edits"}
          </p>
        ) : null}
        {data ? (
          <p className="muted mt-1 text-xs">
            Your hits: {data.exact} exact · {data.correctResult} correct result
          </p>
        ) : null}
      </section>

      <section className="surface-card overflow-x-auto p-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Super 4 League Table</h3>
        <table className="mt-3 min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/15 text-cyan-100/90">
              <th className="p-2">Pos</th>
              <th className="p-2">Player</th>
              <th className="p-2">Pts</th>
              <th className="p-2">Exact</th>
              <th className="p-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {(data?.leaderboard ?? []).map((row, index) => (
              <tr key={row.displayName} className="border-b border-white/10">
                <td className="p-2 font-bold">{index + 1}</td>
                <td className="p-2">
                  {data?.revealPredictions ? (
                    <Link className="underline decoration-dotted" href={`/super4/${encodeURIComponent(row.displayName)}`}>
                      <TeamName
                        name={row.displayName}
                        primaryColor={row.primaryColor}
                        secondaryColor={row.secondaryColor}
                      />
                    </Link>
                  ) : (
                    <TeamName
                      name={row.displayName}
                      primaryColor={row.primaryColor}
                      secondaryColor={row.secondaryColor}
                    />
                  )}
                </td>
                <td className="p-2">{row.points}</td>
                <td className="p-2">{row.exact}</td>
                <td className="p-2">{row.correctResult}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.revealPredictions ? (
          <p className="muted mt-2 text-xs">
            Predictions unlock for viewing once the first result in this GameWeek is entered.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest">
          {data?.locked
            ? `Predictions locked for this ${data.competition === "LEAGUE" ? "GameWeek" : "Gauntlet round"}`
            : `Set your current ${data?.competition === "LEAGUE" ? "GameWeek" : "Gauntlet round"} picks`}
        </h3>
        {data?.pendingFixtures.length ? (
          data.pendingFixtures.map((fixture) => (
            <PickRow
              key={fixture.id}
              fixture={fixture}
              onSave={savePick}
              disabled={Boolean(data?.locked)}
              isSaving={savingFixtureId === fixture.id}
            />
          ))
        ) : (
          <section className="surface-card p-4">
            <p className="muted text-sm">
              No pending fixtures in the current published {data?.competition === "KNOCKOUT" ? "Gauntlet round" : "GameWeek"}.
            </p>
          </section>
        )}
      </section>
      {status ? (
        <p className="rounded-md border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
          {status}
        </p>
      ) : null}
    </div>
  );
}

function PickRow({
  fixture,
  onSave,
  disabled,
  isSaving,
}: {
  fixture: PendingFixture;
  onSave: (fixtureId: string, homeGoals: number, awayGoals: number) => Promise<void>;
  disabled: boolean;
  isSaving: boolean;
}) {
  const [homeGoals, setHomeGoals] = useState(fixture.currentPick?.homeGoals ?? 0);
  const [awayGoals, setAwayGoals] = useState(fixture.currentPick?.awayGoals ?? 0);
  return (
    <section className="surface-card p-4">
      <p className="muted text-xs uppercase tracking-widest">GameWeek {fixture.round}</p>
      <p className="mt-1 text-sm font-semibold">
        <TeamName
          name={fixture.home}
          primaryColor={fixture.homePrimaryColor}
          secondaryColor={fixture.homeSecondaryColor}
        />{" "}
        vs{" "}
        <TeamName
          name={fixture.away}
          primaryColor={fixture.awayPrimaryColor}
          secondaryColor={fixture.awaySecondaryColor}
        />
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          value={homeGoals}
          onChange={(event) => setHomeGoals(Number(event.target.value))}
          className="w-20 rounded-md border border-white/20 bg-black/30 px-2 py-1 text-sm"
        />
        <input
          type="number"
          min={0}
          value={awayGoals}
          onChange={(event) => setAwayGoals(Number(event.target.value))}
          className="w-20 rounded-md border border-white/20 bg-black/30 px-2 py-1 text-sm"
        />
        <button
          type="button"
          className="neo-button rounded-md px-3 py-1.5 text-sm font-semibold"
          onClick={() => void onSave(fixture.id, homeGoals, awayGoals)}
          disabled={disabled || isSaving}
        >
          {disabled ? "Locked" : isSaving ? "Saving..." : fixture.currentPick ? "Update pick" : "Save pick"}
        </button>
        {fixture.currentPick ? (
          <span className="rounded-full border border-cyan-300/45 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
            Locked in: {fixture.currentPick.homeGoals}-{fixture.currentPick.awayGoals}
          </span>
        ) : null}
      </div>
    </section>
  );
}
