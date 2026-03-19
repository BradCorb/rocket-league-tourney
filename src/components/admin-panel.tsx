"use client";

import { useMemo, useState } from "react";
import { TeamName } from "@/components/team-name";

type Fixture = {
  id: string;
  phase: string;
  round: number;
  home: string;
  away: string;
  homePrimaryColor?: string;
  homeSecondaryColor?: string;
  awayPrimaryColor?: string;
  awaySecondaryColor?: string;
  homeGoals: number | null;
  awayGoals: number | null;
};

export function AdminPanel() {
  const [password, setPassword] = useState("");
  const [participantInput, setParticipantInput] = useState(
    "Player 1|DFH Stadium|#00E5FF|#7A5CFF\nPlayer 2|Mannfield|#7A5CFF|#FF4FD8\nPlayer 3|Champions Field|#FF4FD8|#00E5FF\nPlayer 4|Neo Tokyo|#00E5FF|#FF4FD8",
  );
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [message, setMessage] = useState("");

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      "x-admin-password": password,
    }),
    [password],
  );

  async function loadFixtures() {
    const response = await fetch("/api/fixtures", { cache: "no-store" });
    const data = (await response.json()) as Fixture[];
    setFixtures(data);
  }

  async function saveParticipants() {
    const participants = participantInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((part) => part.trim());
        const [displayName, homeStadium, primaryColor, secondaryColor] = parts;
        return {
          displayName,
          homeStadium,
          primaryColor: primaryColor ?? "#00E5FF",
          secondaryColor: secondaryColor ?? "#7A5CFF",
        };
      })
      .filter((entry) => entry.displayName && entry.homeStadium && entry.primaryColor && entry.secondaryColor);

    const response = await fetch("/api/admin/participants", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ participants }),
    });

    if (response.ok) {
      setMessage("Participants saved.");
      await loadFixtures();
    } else {
      setMessage("Failed to save participants (check password/data).");
    }
  }

  async function generateFixtures() {
    const response = await fetch("/api/admin/fixtures/generate", {
      method: "POST",
      headers: authHeaders,
    });
    if (response.ok) {
      setMessage("Fixtures generated.");
      await loadFixtures();
    } else {
      setMessage("Fixture generation failed.");
    }
  }

  async function saveScore(fixtureId: string, homeGoals: number, awayGoals: number) {
    const response = await fetch("/api/admin/results", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ fixtureId, homeGoals, awayGoals }),
    });
    if (response.ok) {
      setMessage("Result updated.");
      await loadFixtures();
    } else {
      setMessage("Result update failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="surface-card fade-in-up p-4">
        <h3 className="mb-2 font-semibold">Admin Access</h3>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Admin password (if configured)"
          className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2"
        />
      </div>

      <div className="surface-card fade-in-up p-4">
        <h3 className="mb-2 font-semibold">Participants</h3>
        <p className="muted mb-2 text-sm">
          One per line: <span className="font-mono">Player Name|Home Stadium|PrimaryHex|SecondaryHex</span>
        </p>
        <textarea
          rows={8}
          value={participantInput}
          onChange={(event) => setParticipantInput(event.target.value)}
          className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => void saveParticipants()}
          className="neo-button mt-3 rounded-lg px-4 py-2 font-semibold"
        >
          Save Participants (Resets Fixtures)
        </button>
      </div>

      <div className="surface-card fade-in-up p-4">
        <h3 className="mb-2 font-semibold">League Fixtures</h3>
        <button
          type="button"
          onClick={() => void generateFixtures()}
          className="neo-button rounded-lg px-4 py-2 font-semibold"
        >
          Generate League Fixtures
        </button>
        <button
          type="button"
          onClick={() => void loadFixtures()}
          className="ghost-button ml-2 rounded-lg px-4 py-2"
        >
          Refresh Fixtures
        </button>
      </div>

      <div className="surface-card fade-in-up p-4">
        <h3 className="mb-2 font-semibold">Enter Scores</h3>
        <p className="muted mb-3 text-sm">
          Enter final score for any fixture. Knockout draws are not allowed.
        </p>
        <div className="space-y-2">
          {fixtures.map((fixture) => (
            <ScoreRow key={fixture.id} fixture={fixture} onSave={saveScore} />
          ))}
        </div>
      </div>

      {message ? <p className="surface-card px-3 py-2">{message}</p> : null}
    </div>
  );
}

function ScoreRow({
  fixture,
  onSave,
}: {
  fixture: Fixture;
  onSave: (fixtureId: string, homeGoals: number, awayGoals: number) => Promise<void>;
}) {
  const [homeGoals, setHomeGoals] = useState(fixture.homeGoals ?? 0);
  const [awayGoals, setAwayGoals] = useState(fixture.awayGoals ?? 0);

  return (
    <div className="grid items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-3 md:grid-cols-[1fr_auto_auto_auto]">
      <div>
        <p className="muted text-sm">
          {fixture.phase} - Round {fixture.round}
        </p>
        <p>
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
      </div>
      <input
        type="number"
        min={0}
        value={homeGoals}
        onChange={(event) => setHomeGoals(Number(event.target.value))}
        className="w-20 rounded-md border border-white/20 bg-black/30 px-2 py-1"
      />
      <input
        type="number"
        min={0}
        value={awayGoals}
        onChange={(event) => setAwayGoals(Number(event.target.value))}
        className="w-20 rounded-md border border-white/20 bg-black/30 px-2 py-1"
      />
      <button
        type="button"
        onClick={() => void onSave(fixture.id, homeGoals, awayGoals)}
        className="neo-button rounded-md px-3 py-1"
      >
        Save
      </button>
    </div>
  );
}
