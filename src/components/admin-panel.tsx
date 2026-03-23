"use client";

import { useEffect, useMemo, useState } from "react";
import { TeamName } from "@/components/team-name";
import {
  getRocketLeagueColorMeta,
  getRocketLeaguePaletteSize,
  resolveRocketLeagueColorInput,
} from "@/lib/rocket-league-colors";

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
  overtimeWinner: "HOME" | "AWAY" | null;
  dueAt: string | null;
};

export function AdminPanel() {
  const [participantInput, setParticipantInput] = useState(
    "Player 1|DFH Stadium|#00E5FF|#7A5CFF\nPlayer 2|Mannfield|#7A5CFF|#FF4FD8\nPlayer 3|Champions Field|#FF4FD8|#00E5FF\nPlayer 4|Neo Tokyo|#20F6A9|#3454FF\nPlayer 5|Utopia Coliseum|#FFB347|#6C5CE7\nPlayer 6|Forbidden Temple|#FF6B6B|#4ECDC4\nPlayer 7|Urban Central|#FFD93D|#845EC2\nPlayer 8|Wasteland|#F9844A|#43AA8B\nPlayer 9|Farmstead|#90BE6D|#577590\nPlayer 10|Aquadome|#00BBF9|#F15BB5",
  );
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "COMPLETED">("ALL");
  const [phaseFilter, setPhaseFilter] = useState<"ALL" | "LEAGUE" | "KNOCKOUT">("ALL");
  const [search, setSearch] = useState("");

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
    }),
    [],
  );
  const participantPreview = useMemo(() => {
    return participantInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [displayName = "", homeStadium = "", primary = "#00E5FF", accent = "#7A5CFF"] =
          line.split("|").map((part) => part.trim());
        const primaryHex = resolveRocketLeagueColorInput(primary, "PRIMARY", "#00E5FF");
        const accentHex = resolveRocketLeagueColorInput(accent, "ACCENT", "#7A5CFF");
        return {
          id: `${displayName}-${index}`,
          displayName: displayName || `Player ${index + 1}`,
          homeStadium: homeStadium || "TBD Stadium",
          primaryHex,
          accentHex,
          primaryMeta: getRocketLeagueColorMeta(primaryHex, "PRIMARY"),
          accentMeta: getRocketLeagueColorMeta(accentHex, "ACCENT"),
        };
      });
  }, [participantInput]);
  const fixturesForScoring = useMemo(() => {
    const league = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
    const knockout = fixtures
      .filter((fixture) => fixture.phase === "KNOCKOUT")
      .sort((a, b) => a.round - b.round);
    const nextKnockout =
      knockout.find((fixture) => fixture.homeGoals === null || fixture.awayGoals === null) ?? null;
    const list = [...league, ...(nextKnockout ? [nextKnockout] : [])];
    return list.filter((fixture) => {
      if (phaseFilter !== "ALL" && fixture.phase !== phaseFilter) return false;
      const isCompleted = fixture.homeGoals !== null && fixture.awayGoals !== null;
      if (statusFilter === "COMPLETED" && !isCompleted) return false;
      if (statusFilter === "PENDING" && isCompleted) return false;
      if (search.trim().length > 0) {
        const q = search.trim().toLowerCase();
        const text = `${fixture.home} ${fixture.away} ${fixture.phase} ${fixture.round}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [fixtures, phaseFilter, statusFilter, search]);

  async function loadFixtures() {
    const response = await fetch("/api/fixtures", { cache: "no-store" });
    const data = (await response.json()) as Fixture[];
    setFixtures((previous) => {
      if (previous.length === 0) {
        return data;
      }

      const byId = new Map(data.map((fixture) => [fixture.id, fixture]));
      const merged = previous
        .map((fixture) => byId.get(fixture.id))
        .filter((fixture): fixture is Fixture => Boolean(fixture));

      const seen = new Set(merged.map((fixture) => fixture.id));
      for (const fixture of data) {
        if (!seen.has(fixture.id)) {
          merged.push(fixture);
        }
      }

      return merged;
    });
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
          primaryColor: resolveRocketLeagueColorInput(primaryColor, "PRIMARY", "#00E5FF"),
          secondaryColor: resolveRocketLeagueColorInput(secondaryColor, "ACCENT", "#7A5CFF"),
        };
      })
      .filter((entry) => entry.displayName && entry.homeStadium && entry.primaryColor && entry.secondaryColor);

    if (participants.length < 2) {
      setMessage("Need at least 2 valid participant lines.");
      return;
    }

    const response = await fetch("/api/admin/participants", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ participants }),
    });

    if (response.ok) {
      setMessage("Participants saved.");
      await loadFixtures();
    } else {
      setMessage("Failed to save participants (check data).");
    }
  }

  async function generateFixtures() {
    const response = await fetch("/api/admin/fixtures/generate", {
      method: "POST",
      headers: authHeaders,
    });
    const data = (await response.json()) as { created?: number };
    if (response.ok) {
      if ((data.created ?? 0) > 0) {
        setMessage("Fixtures generated.");
      } else {
        setMessage("League fixtures already exist.");
      }
      await loadFixtures();
    } else {
      setMessage("Fixture generation failed.");
    }
  }

  async function saveScore(
    fixtureId: string,
    homeGoals: number,
    awayGoals: number,
    wentToOvertime: boolean,
  ): Promise<boolean> {
    const response = await fetch("/api/admin/results", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ fixtureId, homeGoals, awayGoals, wentToOvertime }),
    });
    if (response.ok) {
      setMessage("Result updated.");
      setFixtures((previous) =>
        previous.map((fixture) =>
          fixture.id === fixtureId
            ? {
                ...fixture,
                homeGoals,
                awayGoals,
                overtimeWinner:
                  wentToOvertime
                    ? homeGoals > awayGoals
                      ? "HOME"
                      : "AWAY"
                    : null,
              }
            : fixture,
        ),
      );
      await loadFixtures();
      return true;
    } else {
      setMessage("Result update failed.");
      return false;
    }
  }

  async function extendFixture(fixtureId: string, extraDays: number) {
    const response = await fetch("/api/admin/fixtures/extend", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ fixtureId, extraDays }),
    });
    if (response.ok) {
      setMessage("Fixture deadline extended.");
      await loadFixtures();
    } else {
      setMessage("Failed to extend fixture deadline.");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFixtures();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3500);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className="space-y-6">
      <div className="surface-card fade-in-up p-4">
        <h3 className="mb-2 font-semibold">Participants</h3>
        <p className="muted mb-2 text-sm">
          One per line: <span className="font-mono">Player Name|Home Stadium|PrimaryHex|SecondaryHex</span>
        </p>
        <p className="muted mb-2 text-xs">
          You can enter colors as hex (`#7A5CFF`), coordinates (`12/3` = column/row), or names (`white`, `light purple`).
        </p>
        <p className="muted mb-2 text-xs">
          Rocket League palette reference loaded: {getRocketLeaguePaletteSize("PRIMARY")} Primary and {getRocketLeaguePaletteSize("ACCENT")} Accent colors.
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
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-100/85">Detected Color Names</p>
          <div className="grid gap-2 md:grid-cols-2">
            {participantPreview.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                <p className="font-semibold">{entry.displayName}</p>
                <p className="muted">{entry.homeStadium}</p>
                <p className="mt-1">
                  Primary:{" "}
                  <span className="font-semibold text-cyan-100">{entry.primaryMeta.label}</span>{" "}
                  <span className="muted">({entry.primaryHex})</span>
                </p>
                <p>
                  Accent:{" "}
                  <span className="font-semibold text-fuchsia-100">{entry.accentMeta.label}</span>{" "}
                  <span className="muted">({entry.accentHex})</span>
                </p>
              </div>
            ))}
          </div>
        </div>
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
          Enter final score for any fixture. If the match finished in overtime,
          set OT winner and points will be 2 for winner, 1 for loser.
        </p>
        <p className="muted mb-3 text-xs">
          Knockout is single-step entry: only the current knockout match is shown until it is completed.
        </p>
        <div className="mb-3 grid gap-2 md:grid-cols-4">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search team or round"
            className="rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm"
          />
          <select
            value={phaseFilter}
            onChange={(event) => setPhaseFilter(event.target.value as "ALL" | "LEAGUE" | "KNOCKOUT")}
            className="rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm"
          >
            <option value="ALL">All phases</option>
            <option value="LEAGUE">League only</option>
            <option value="KNOCKOUT">Knockout only</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "ALL" | "PENDING" | "COMPLETED")}
            className="rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <p className="muted self-center text-sm">
            Showing {fixturesForScoring.length} fixture{fixturesForScoring.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="space-y-2">
          {fixturesForScoring.map((fixture) => (
            <ScoreRow
              key={`${fixture.id}-${fixture.homeGoals ?? "x"}-${fixture.awayGoals ?? "x"}-${fixture.overtimeWinner ?? "N"}`}
              fixture={fixture}
              onSave={saveScore}
              onExtend={extendFixture}
            />
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
  onExtend,
}: {
  fixture: Fixture;
  onSave: (
    fixtureId: string,
    homeGoals: number,
    awayGoals: number,
    wentToOvertime: boolean,
  ) => Promise<boolean>;
  onExtend: (fixtureId: string, extraDays: number) => Promise<void>;
}) {
  const [homeGoals, setHomeGoals] = useState(fixture.homeGoals ?? 0);
  const [awayGoals, setAwayGoals] = useState(fixture.awayGoals ?? 0);
  const [wentToOvertime, setWentToOvertime] = useState<boolean>(Boolean(fixture.overtimeWinner));
  const [extraDays, setExtraDays] = useState(1);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const isPlayed = fixture.homeGoals !== null && fixture.awayGoals !== null;
  const playedFieldClass = isPlayed
    ? "border-emerald-300/70 bg-emerald-700/35 text-emerald-50"
    : "border-white/20 bg-black/30";

  const isChanged =
    homeGoals !== (fixture.homeGoals ?? 0) ||
    awayGoals !== (fixture.awayGoals ?? 0) ||
    wentToOvertime !== Boolean(fixture.overtimeWinner);
  const hasInvalidDraw = homeGoals === awayGoals;

  const saveButtonText =
    status === "saving"
      ? "Saving..."
      : status === "saved"
        ? "Saved score"
        : isChanged
          ? "Save changes"
          : isPlayed
            ? "Saved score"
            : "Save result";

  async function handleSave() {
    if (hasInvalidDraw) {
      setStatus("failed");
      return;
    }
    setStatus("saving");
    const ok = await onSave(
      fixture.id,
      homeGoals,
      awayGoals,
      wentToOvertime,
    );
    setStatus(ok ? "saved" : "failed");
  }

  return (
    <div
      className={`grid items-center gap-2 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto_auto_auto] ${
        isPlayed
          ? "border-emerald-300/60 bg-emerald-600/20 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
          : "border-white/10 bg-black/20"
      }`}
    >
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
        className={`w-20 rounded-md border px-2 py-1 ${playedFieldClass}`}
      />
      <input
        type="number"
        min={0}
        value={awayGoals}
        onChange={(event) => setAwayGoals(Number(event.target.value))}
        className={`w-20 rounded-md border px-2 py-1 ${playedFieldClass}`}
      />
      <select
        value={wentToOvertime ? "YES" : "NO"}
        onChange={(event) => setWentToOvertime(event.target.value === "YES")}
        className={`rounded-md border px-2 py-1 text-sm ${playedFieldClass}`}
        title="Mark whether this match had an overtime winner"
      >
        <option value="NO">No OT winner</option>
        <option value="YES">OT winner</option>
      </select>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={hasInvalidDraw || status === "saving"}
        className="neo-button rounded-md px-3 py-1"
      >
        {saveButtonText}
      </button>
      <p className="text-xs font-semibold md:col-span-5">
        {hasInvalidDraw ? (
          <span className="text-amber-300">Score cannot be a draw. Enter a winning scoreline.</span>
        ) : null}
        {status === "saved" ? (
          <span className="text-emerald-300">Saved in this match row.</span>
        ) : null}
        {status === "failed" ? (
          <span className="text-rose-300">Save failed. Check score/overtime and try again.</span>
        ) : null}
      </p>
      <div className="flex items-center gap-2 md:col-span-5">
        <p className="muted text-xs">
          Due: {fixture.dueAt ? new Date(fixture.dueAt).toLocaleDateString() : "Not set"}
        </p>
        <input
          type="number"
          min={1}
          max={30}
          value={extraDays}
          onChange={(event) => setExtraDays(Number(event.target.value))}
          className="w-16 rounded-md border border-white/20 bg-black/30 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => void onExtend(fixture.id, extraDays)}
          className="ghost-button rounded-md px-3 py-1 text-xs"
        >
          Extend deadline
        </button>
      </div>
    </div>
  );
}
