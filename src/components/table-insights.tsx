"use client";

import { useMemo, useState } from "react";
import { TeamName } from "@/components/team-name";

type ParticipantLite = {
  id: string;
  displayName: string;
  primaryColor: string;
  secondaryColor: string;
};

type FixtureLite = {
  id: string;
  phase: string;
  round: number;
  homeParticipantId: string;
  awayParticipantId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  overtimeWinner: "HOME" | "AWAY" | null;
  playedAt: string | Date | null;
  createdAt: string | Date;
};

type Mode = "overall" | "home" | "away";
type ResultChar = "W" | "D" | "L";
type Tab = "overall" | "home" | "away" | "scorers" | "defence";
type FormWindow = "ALL" | 3 | 5 | 10;

type TableRow = {
  participantId: string;
  team: string;
  primaryColor: string;
  secondaryColor: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  otPoints: number;
  recent: ResultChar[];
  formPoints: number;
};

type TotalsRow = {
  participantId: string;
  team: string;
  primaryColor: string;
  secondaryColor: string;
  goalsFor: number;
  goalsAgainst: number;
};

function getParticipantPoints(
  isHome: boolean,
  homeGoals: number,
  awayGoals: number,
  overtimeWinner: "HOME" | "AWAY" | null,
): number {
  if (homeGoals > awayGoals) {
    if (overtimeWinner === "HOME") return isHome ? 2 : 1;
    return isHome ? 3 : 0;
  }
  if (awayGoals > homeGoals) {
    if (overtimeWinner === "AWAY") return isHome ? 1 : 2;
    return isHome ? 0 : 3;
  }
  return 1;
}

function getResultChar(isHome: boolean, homeGoals: number, awayGoals: number): ResultChar {
  if (homeGoals > awayGoals) return isHome ? "W" : "L";
  if (awayGoals > homeGoals) return isHome ? "L" : "W";
  return "D";
}

function computeTable(
  participants: ParticipantLite[],
  fixtures: FixtureLite[],
  mode: Mode,
  formWindow: FormWindow,
): TableRow[] {
  const table = new Map<string, TableRow>();
  const gamesByTeam = new Map<
    string,
    Array<{ points: number; result: ResultChar; playedAt: number; gf: number; ga: number; ot: boolean }>
  >();
  for (const participant of participants) {
    gamesByTeam.set(participant.id, []);
  }

  for (const fixture of fixtures) {
    if (fixture.phase !== "LEAGUE") continue;
    if (fixture.homeGoals === null || fixture.awayGoals === null) continue;

    const playedAt = new Date(fixture.playedAt ?? fixture.createdAt).getTime();
    const includeHome = mode !== "away";
    const includeAway = mode !== "home";

    if (includeHome) {
      const points = getParticipantPoints(true, fixture.homeGoals, fixture.awayGoals, fixture.overtimeWinner);
      const homeResult = getResultChar(true, fixture.homeGoals, fixture.awayGoals);
      gamesByTeam.get(fixture.homeParticipantId)?.push({
        points,
        result: homeResult,
        playedAt,
        gf: fixture.homeGoals,
        ga: fixture.awayGoals,
        ot: fixture.overtimeWinner === "HOME" || fixture.overtimeWinner === "AWAY",
      });
    }

    if (includeAway) {
      const points = getParticipantPoints(false, fixture.homeGoals, fixture.awayGoals, fixture.overtimeWinner);
      const awayResult = getResultChar(false, fixture.homeGoals, fixture.awayGoals);
      gamesByTeam.get(fixture.awayParticipantId)?.push({
        points,
        result: awayResult,
        playedAt,
        gf: fixture.awayGoals,
        ga: fixture.homeGoals,
        ot: fixture.overtimeWinner === "HOME" || fixture.overtimeWinner === "AWAY",
      });
    }
  }

  for (const participant of participants) {
    const allGames = [...(gamesByTeam.get(participant.id) ?? [])].sort((a, b) => a.playedAt - b.playedAt);
    const selectedGames =
      formWindow === "ALL" ? allGames : allGames.slice(-formWindow);

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let points = 0;
    let otPoints = 0;
    for (const game of selectedGames) {
      goalsFor += game.gf;
      goalsAgainst += game.ga;
      points += game.points;
      if (game.ot) {
        otPoints += game.points;
      }
      if (game.result === "W") wins += 1;
      else if (game.result === "D") draws += 1;
      else losses += 1;
    }

    table.set(participant.id, {
      participantId: participant.id,
      team: participant.displayName,
      primaryColor: participant.primaryColor,
      secondaryColor: participant.secondaryColor,
      played: selectedGames.length,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points,
      otPoints,
      recent: selectedGames.map((game) => game.result),
      formPoints: points,
    });
  }

  return [...table.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.team.localeCompare(b.team);
  });
}

function computeWindowTotals(
  participants: ParticipantLite[],
  fixtures: FixtureLite[],
  mode: Mode,
  formWindow: FormWindow,
): TotalsRow[] {
  const byTeam = new Map<
    string,
    {
      participant: ParticipantLite;
      matches: Array<{ gf: number; ga: number; playedAt: number }>;
    }
  >();

  for (const participant of participants) {
    byTeam.set(participant.id, { participant, matches: [] });
  }

  for (const fixture of fixtures) {
    if (fixture.phase !== "LEAGUE") continue;
    if (fixture.homeGoals === null || fixture.awayGoals === null) continue;
    const playedAt = new Date(fixture.playedAt ?? fixture.createdAt).getTime();

    if (mode !== "away") {
      byTeam.get(fixture.homeParticipantId)?.matches.push({
        gf: fixture.homeGoals,
        ga: fixture.awayGoals,
        playedAt,
      });
    }
    if (mode !== "home") {
      byTeam.get(fixture.awayParticipantId)?.matches.push({
        gf: fixture.awayGoals,
        ga: fixture.homeGoals,
        playedAt,
      });
    }
  }

  const rows: TotalsRow[] = [];
  for (const [participantId, data] of byTeam.entries()) {
    const recent = [...data.matches]
      .sort((a, b) => a.playedAt - b.playedAt)
      .slice(formWindow === "ALL" ? 0 : -formWindow);
    rows.push({
      participantId,
      team: data.participant.displayName,
      primaryColor: data.participant.primaryColor,
      secondaryColor: data.participant.secondaryColor,
      goalsFor: recent.reduce((sum, match) => sum + match.gf, 0),
      goalsAgainst: recent.reduce((sum, match) => sum + match.ga, 0),
    });
  }

  return rows;
}

function ResultBadge({ value }: { value: ResultChar }) {
  const color =
    value === "W" ? "text-emerald-300" : value === "D" ? "text-yellow-300" : "text-rose-300";
  return <span className={`font-semibold ${color}`}>{value}</span>;
}

function OverallSection({ rows }: { rows: TableRow[] }) {
  return (
    <section className="surface-card overflow-x-auto p-3">
      <h3 className="mb-2 text-lg font-semibold">Overall Table</h3>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/15 text-cyan-100/90">
            <th className="p-2">Pos</th>
            <th className="p-2">Team</th>
            <th className="p-2">P</th>
            <th className="p-2">W</th>
            <th className="p-2">D</th>
            <th className="p-2">L</th>
            <th className="p-2">GF</th>
            <th className="p-2">GA</th>
            <th className="p-2">GD</th>
            <th className="p-2">Pts</th>
            <th className="p-2">OT Pts</th>
            <th className="p-2">Form</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.participantId} className="border-b border-white/10 hover:bg-white/5">
              <td className="p-2 font-bold">{index + 1}</td>
              <td className="p-2">
                <TeamName
                  name={row.team}
                  primaryColor={row.primaryColor}
                  secondaryColor={row.secondaryColor}
                />
              </td>
              <td className="p-2">{row.played}</td>
              <td className="p-2">{row.wins}</td>
              <td className="p-2">{row.draws}</td>
              <td className="p-2">{row.losses}</td>
              <td className="p-2">{row.goalsFor}</td>
              <td className="p-2">{row.goalsAgainst}</td>
              <td className="p-2">{row.goalDifference}</td>
              <td className="p-2 font-semibold">{row.points}</td>
              <td className="p-2">{row.otPoints}</td>
              <td className="p-2">
                {row.recent.length > 0 ? (
                  <span className="inline-flex gap-1">
                    {row.recent.map((result, idx) => (
                      <ResultBadge key={`${row.participantId}-${idx}`} value={result} />
                    ))}
                  </span>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FormSection({
  title,
  rows,
}: {
  title: string;
  rows: TableRow[];
}) {
  return (
    <section className="surface-card overflow-x-auto p-3">
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/15 text-cyan-100/90">
            <th className="p-2">Pos</th>
            <th className="p-2">Team</th>
            <th className="p-2">P</th>
            <th className="p-2">W</th>
            <th className="p-2">D</th>
            <th className="p-2">L</th>
            <th className="p-2">GF</th>
            <th className="p-2">GA</th>
            <th className="p-2">GD</th>
            <th className="p-2">Pts</th>
            <th className="p-2">OT Pts</th>
            <th className="p-2">Form</th>
            <th className="p-2">Form Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.participantId} className="border-b border-white/10 hover:bg-white/5">
              <td className="p-2 font-bold">{index + 1}</td>
              <td className="p-2">
                <TeamName
                  name={row.team}
                  primaryColor={row.primaryColor}
                  secondaryColor={row.secondaryColor}
                />
              </td>
              <td className="p-2">{row.played}</td>
              <td className="p-2">{row.wins}</td>
              <td className="p-2">{row.draws}</td>
              <td className="p-2">{row.losses}</td>
              <td className="p-2">{row.goalsFor}</td>
              <td className="p-2">{row.goalsAgainst}</td>
              <td className="p-2">{row.goalDifference}</td>
              <td className="p-2 font-semibold">{row.points}</td>
              <td className="p-2">{row.otPoints}</td>
              <td className="p-2">
                {row.recent.length > 0 ? (
                  <span className="inline-flex gap-1">
                    {row.recent.map((result, idx) => (
                      <ResultBadge key={`${row.participantId}-${idx}`} value={result} />
                    ))}
                  </span>
                ) : (
                  "-"
                )}
              </td>
              <td className="p-2">{row.formPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function TableInsights({
  participants,
  fixtures,
}: {
  participants: ParticipantLite[];
  fixtures: FixtureLite[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("overall");
  const [formWindow, setFormWindow] = useState<FormWindow>("ALL");

  const { overall, home, away } = useMemo(() => {
    return {
      overall: computeTable(participants, fixtures, "overall", formWindow),
      home: computeTable(participants, fixtures, "home", formWindow),
      away: computeTable(participants, fixtures, "away", formWindow),
    };
  }, [participants, fixtures, formWindow]);

  const windowTotals = useMemo(
    () => computeWindowTotals(participants, fixtures, "overall", formWindow),
    [participants, fixtures, formWindow],
  );

  const topScorers = [...windowTotals]
    .sort((a, b) => b.goalsFor - a.goalsFor || a.team.localeCompare(b.team))
    .slice(0, 10);
  const bestDefence = [...windowTotals]
    .sort((a, b) => a.goalsAgainst - b.goalsAgainst || a.team.localeCompare(b.team))
    .slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap gap-2 p-2">
        <button
          type="button"
          onClick={() => setActiveTab("overall")}
          aria-pressed={activeTab === "overall"}
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "overall" ? "ring-2 ring-cyan-300/60" : ""}`}
        >
          Overall Table
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("home")}
          aria-pressed={activeTab === "home"}
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "home" ? "ring-2 ring-cyan-300/60" : ""}`}
        >
          Home
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("away")}
          aria-pressed={activeTab === "away"}
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "away" ? "ring-2 ring-cyan-300/60" : ""}`}
        >
          Away
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("scorers")}
          aria-pressed={activeTab === "scorers"}
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "scorers" ? "ring-2 ring-cyan-300/60" : ""}`}
        >
          Top Scorers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("defence")}
          aria-pressed={activeTab === "defence"}
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "defence" ? "ring-2 ring-cyan-300/60" : ""}`}
        >
          Best Defence
        </button>
      </div>

      <div className="surface-card flex flex-wrap items-center gap-3 p-3">
        <label htmlFor="form-size" className="text-sm font-semibold">
          Form
        </label>
        <select
          id="form-size"
          value={formWindow}
          onChange={(event) => {
            const value = event.target.value;
            setFormWindow(value === "ALL" ? "ALL" : Number(value) as FormWindow);
          }}
          className="rounded-lg border border-white/20 bg-black/30 px-3 py-2"
        >
          <option value="ALL">ALL</option>
          {[3, 5, 10].map((size) => (
            <option key={size} value={size}>
              Last {size} game{size === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </div>

      {activeTab === "overall" ? <OverallSection rows={overall} /> : null}
      {activeTab === "home" ? <FormSection title="Home Table" rows={home} /> : null}
      {activeTab === "away" ? <FormSection title="Away Table" rows={away} /> : null}

      {activeTab === "scorers" ? (
        <section className="surface-card p-4">
          <h3 className="mb-2 text-lg font-semibold">Top Scorers (Goals For)</h3>
          <div className="space-y-1 text-sm">
            {topScorers.map((row, index) => (
              <p key={row.participantId}>
                {index + 1}.{" "}
                <TeamName
                  name={row.team}
                  primaryColor={row.primaryColor}
                  secondaryColor={row.secondaryColor}
                />{" "}
                - {row.goalsFor}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "defence" ? (
        <section className="surface-card p-4">
          <h3 className="mb-2 text-lg font-semibold">Best Defence (Least GA)</h3>
          <div className="space-y-1 text-sm">
            {bestDefence.map((row, index) => (
              <p key={row.participantId}>
                {index + 1}.{" "}
                <TeamName
                  name={row.team}
                  primaryColor={row.primaryColor}
                  secondaryColor={row.secondaryColor}
                />{" "}
                - {row.goalsAgainst}
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
