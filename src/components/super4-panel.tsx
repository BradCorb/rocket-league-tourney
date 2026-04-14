"use client";

import { useEffect, useState } from "react";

type PendingFixture = {
  id: string;
  round: number;
  home: string;
  away: string;
  currentPick: { fixtureId: string; homeGoals: number; awayGoals: number } | null;
};

type Super4Payload = {
  displayName: string;
  points: number;
  pendingFixtures: PendingFixture[];
};

export function Super4Panel() {
  const [data, setData] = useState<Super4Payload | null>(null);
  const [status, setStatus] = useState("");

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
    setStatus("Saving...");
    const response = await fetch("/api/super4/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureId, homeGoals, awayGoals }),
    });
    setStatus(response.ok ? "Pick saved." : "Failed to save pick.");
    const refresh = await fetch("/api/super4/picks", { cache: "no-store" });
    if (refresh.ok) {
      const payload = (await refresh.json()) as Super4Payload;
      setData(payload);
    }
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
      </section>

      <section className="space-y-3">
        {data?.pendingFixtures.length ? (
          data.pendingFixtures.map((fixture) => (
            <PickRow key={fixture.id} fixture={fixture} onSave={savePick} />
          ))
        ) : (
          <section className="surface-card p-4">
            <p className="muted text-sm">No pending fixtures in current published GameWeeks.</p>
          </section>
        )}
      </section>
      {status ? <p className="muted text-xs">{status}</p> : null}
    </div>
  );
}

function PickRow({
  fixture,
  onSave,
}: {
  fixture: PendingFixture;
  onSave: (fixtureId: string, homeGoals: number, awayGoals: number) => Promise<void>;
}) {
  const [homeGoals, setHomeGoals] = useState(fixture.currentPick?.homeGoals ?? 0);
  const [awayGoals, setAwayGoals] = useState(fixture.currentPick?.awayGoals ?? 0);
  return (
    <section className="surface-card p-4">
      <p className="muted text-xs uppercase tracking-widest">GameWeek {fixture.round}</p>
      <p className="mt-1 text-sm font-semibold">
        {fixture.home} vs {fixture.away}
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
        >
          Save pick
        </button>
      </div>
    </section>
  );
}
