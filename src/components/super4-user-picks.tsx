"use client";

import { useEffect, useState } from "react";
import { TeamName } from "@/components/team-name";

type PredictionRow = {
  fixtureId: string;
  round: number;
  home: string;
  away: string;
  homePrimaryColor?: string;
  homeSecondaryColor?: string;
  awayPrimaryColor?: string;
  awaySecondaryColor?: string;
  predictedHome: number | null;
  predictedAway: number | null;
  actualHome: number | null;
  actualAway: number | null;
  resultKind?: "NORMAL" | "DOUBLE_FORFEIT" | "HOME_WALKOVER" | "AWAY_WALKOVER" | null;
};

type Payload = {
  activeRound: number | null;
  predictions: PredictionRow[];
};

export function Super4UserPicks({ displayName }: { displayName: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const response = await fetch(`/api/super4/user/${encodeURIComponent(displayName)}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (mounted) setError(payload.error ?? "Unable to load predictions.");
        return;
      }
      const payload = (await response.json()) as Payload;
      if (mounted) setData(payload);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [displayName]);

  if (error) return <p className="muted text-sm">{error}</p>;
  if (!data) return <p className="muted text-sm">Loading predictions...</p>;

  return (
    <section className="surface-card p-4">
      <p className="muted text-xs uppercase tracking-widest">GameWeek {data.activeRound ?? "-"}</p>
      <div className="mt-3 space-y-2">
        {data.predictions.map((row) => (
          <article key={row.fixtureId} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
            <p className="font-semibold">
              <TeamName
                name={row.home}
                primaryColor={row.homePrimaryColor}
                secondaryColor={row.homeSecondaryColor}
              />{" "}
              vs{" "}
              <TeamName
                name={row.away}
                primaryColor={row.awayPrimaryColor}
                secondaryColor={row.awaySecondaryColor}
              />
            </p>
            <p className="muted mt-1 text-xs">
              Predicted:{" "}
              {row.predictedHome === null || row.predictedAway === null
                ? "No pick submitted"
                : `${row.predictedHome} - ${row.predictedAway}`}
            </p>
            <p className="muted text-xs">
              Actual:{" "}
              {row.resultKind && row.resultKind !== "NORMAL"
                ? "Void (forfeit)"
                : row.actualHome === null || row.actualAway === null
                ? "Pending"
                : `${row.actualHome} - ${row.actualAway}`}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
