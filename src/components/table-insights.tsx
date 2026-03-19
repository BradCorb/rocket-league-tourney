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
  formSize: number,
): TableRow[] {
  const table = new Map<string, TableRow>();
  const gamesByTeam = new Map<
    string,
    Array<{ points: number; result: ResultChar; playedAt: number }>
  >();

  for (const participant of participants) {
    table.set(participant.id, {
      participantId: participant.id,
      team: participant.displayName,
      primaryColor: participant.primaryColor,
      secondaryColor: participant.secondaryColor,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      recent: [],
      formPoints: 0,
    });
    gamesByTeam.set(participant.id, []);
  }

  for (const fixture of fixtures) {
    if (fixture.phase !== "LEAGUE") continue;
    if (fixture.homeGoals === null || fixture.awayGoals === null) continue;

    const playedAt = new Date(fixture.playedAt ?? fixture.createdAt).getTime();
    const homeRow = table.get(fixture.homeParticipantId);
    const awayRow = table.get(fixture.awayParticipantId);
    if (!homeRow || !awayRow) continue;

    const includeHome = mode !== "away";
    const includeAway = mode !== "home";

    if (includeHome) {
      const points = getParticipantPoints(true, fixture.homeGoals, fixture.awayGoals, fixture.overtimeWinner);
      homeRow.played += 1;
      homeRow.goalsFor += fixture.homeGoals;
      homeRow.goalsAgainst += fixture.awayGoals;
      homeRow.points += points;
      const homeResult = getResultChar(true, fixture.homeGoals, fixture.awayGoals);
      if (homeResult === "W") homeRow.wins += 1;
      else if (homeResult === "L") homeRow.losses += 1;
      else homeRow.draws += 1;
      gamesByTeam.get(homeRow.participantId)?.push({
        points,
        result: homeResult,
        playedAt,
      });
    }

    if (includeAway) {
      const points = getParticipantPoints(false, fixture.homeGoals, fixture.awayGoals, fixture.overtimeWinner);
      awayRow.played += 1;
      awayRow.goalsFor += fixture.awayGoals;
      awayRow.goalsAgainst += fixture.homeGoals;
      awayRow.points += points;
      const awayResult = getResultChar(false, fixture.homeGoals, fixture.awayGoals);
      if (awayResult === "W") awayRow.wins += 1;
      else if (awayResult === "L") awayRow.losses += 1;
      else awayRow.draws += 1;
      gamesByTeam.get(awayRow.participantId)?.push({
        points,
        result: awayResult,
        playedAt,
      });
    }
  }

  for (const row of table.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    const games = (gamesByTeam.get(row.participantId) ?? [])
      .sort((a, b) => a.playedAt - b.playedAt)
      .slice(-formSize);
    row.recent = games.map((game) => game.result);
    row.formPoints = games.reduce((sum, game) => sum + game.points, 0);
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
  windowSize: number,
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
      .slice(-windowSize);
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
              <td className="p-2">{row.recent.join(" ") || "-"}</td>
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
  const [formSize, setFormSize] = useState(5);

  const { overall, home, away } = useMemo(() => {
    return {
      overall: computeTable(participants, fixtures, "overall", formSize),
      home: computeTable(participants, fixtures, "home", formSize),
      away: computeTable(participants, fixtures, "away", formSize),
    };
  }, [participants, fixtures, formSize]);

  const windowTotals = useMemo(
    () => computeWindowTotals(participants, fixtures, "overall", formSize),
    [participants, fixtures, formSize],
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
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "overall" ? "ring-2 ring-cyan-300/60" : ""}`}
        >
          Overall Table
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("home")}
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "home" ? "ring-2 ring-cyan-300/60" : ""}`}
        >
          Home Form
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("away")}
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "away" ? "ring-2 ring-cyan-300/60" : ""}`}
        >
          Away Form
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("scorers")}
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "scorers" ? "ring-2 ring-cyan-300/60" : ""}`}
        >
          Top Scorers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("defence")}
          className={`ghost-button rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "defence" ? "ring-2 ring-cyan-300/60" : ""}`}
        >
          Best Defence
        </button>
      </div>

      {activeTab !== "overall" ? (
        <div className="surface-card flex flex-wrap items-center gap-3 p-3">
          <label htmlFor="form-size" className="text-sm font-semibold">
            Form Window
          </label>
          <select
            id="form-size"
            value={formSize}
            onChange={(event) => setFormSize(Number(event.target.value))}
            className="rounded-lg border border-white/20 bg-black/30 px-3 py-2"
          >
            {[1, 2, 3, 5, 7, 10].map((size) => (
              <option key={size} value={size}>
                Last {size} game{size === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {activeTab === "overall" ? <OverallSection rows={overall} /> : null}
      {activeTab === "home" ? <FormSection title="Home Form Table" rows={home} /> : null}
      {activeTab === "away" ? <FormSection title="Away Form Table" rows={away} /> : null}

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
