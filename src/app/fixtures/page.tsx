import { getTournamentDataReadOnly } from "@/lib/data";
import { formatUkDate } from "@/lib/date-format";
import { TeamName } from "@/components/team-name";
import { GameWeekJump } from "@/components/gameweek-jump";
import { runSupercomputer } from "@/lib/supercomputer";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function FixturesPage() {
  const { tournament, participants, fixtures } = await getTournamentDataReadOnly();
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const supercomputer = runSupercomputer(participants, fixtures, 10000);
  const predictionByFixtureId = new Map(
    supercomputer.fixturePredictions.map((prediction) => [prediction.fixtureId, prediction]),
  );
  const leagueFixtures = fixtures
    .filter((fixture) => fixture.phase === "LEAGUE")
    .sort((a, b) => (a.round !== b.round ? a.round - b.round : a.createdAt.getTime() - b.createdAt.getTime()));
  const knockoutFixtures = fixtures
    .filter((fixture) => fixture.phase === "KNOCKOUT")
    .sort((a, b) => (a.round !== b.round ? a.round - b.round : a.createdAt.getTime() - b.createdAt.getTime()));

  const leagueRounds = [...new Set(leagueFixtures.map((fixture) => fixture.round))].sort((a, b) => a - b);
  const firstLockedRound =
    leagueRounds.find((round) =>
      leagueFixtures
        .filter((fixture) => fixture.round === round)
        .some((fixture) => fixture.homeGoals === null || fixture.awayGoals === null),
    ) ?? null;
  const maxVisibleRound =
    firstLockedRound ?? (leagueRounds.length > 0 ? leagueRounds[leagueRounds.length - 1] : 0);
  const visibleLeagueFixtures = leagueFixtures.filter((fixture) => fixture.round <= maxVisibleRound);
  const completedLeagueCount = leagueFixtures.filter(
    (fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null,
  ).length;
  const leagueCompletionPct = leagueFixtures.length > 0
    ? Math.round((completedLeagueCount / leagueFixtures.length) * 100)
    : 0;
  const pendingLeagueCount = leagueFixtures.length - completedLeagueCount;
  const pendingVisibleCount = visibleLeagueFixtures.filter(
    (fixture) => fixture.homeGoals === null || fixture.awayGoals === null,
  ).length;
  const nextKnockoutRound = knockoutFixtures.find(
    (fixture) => fixture.homeGoals === null || fixture.awayGoals === null,
  )?.round;
  const completedKnockoutCount = knockoutFixtures.filter(
    (fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null,
  ).length;

  const fixturesByRound = new Map<number, typeof visibleLeagueFixtures>();
  for (const fixture of visibleLeagueFixtures) {
    const list = fixturesByRound.get(fixture.round) ?? [];
    list.push(fixture);
    fixturesByRound.set(fixture.round, list);
  }
  const byeByRound = new Map<number, string[]>();
  for (const round of leagueRounds) {
    const roundFixtures = leagueFixtures.filter((fixture) => fixture.round === round);
    const roundTeams = new Set<string>();
    for (const fixture of roundFixtures) {
      roundTeams.add(fixture.homeParticipantId);
      roundTeams.add(fixture.awayParticipantId);
    }
    const byeTeams = participants
      .filter((participant) => !roundTeams.has(participant.id))
      .map((participant) => participant.displayName);
    if (byeTeams.length > 0) {
      byeByRound.set(round, byeTeams);
    }
  }

  const getDeadlineText = (dueAt: Date | null) => {
    return dueAt ? `Deadline: ${formatUkDate(dueAt)}` : "Deadline: not set";
  };

  const getScoreText = (
    homeGoals: number | null,
    awayGoals: number | null,
    overtimeWinner: "HOME" | "AWAY" | null,
    resultKind: (typeof fixtures)[number]["resultKind"],
  ) => {
    if (homeGoals === null || awayGoals === null) return "vs";
    if (resultKind === "DOUBLE_FORFEIT") {
      return "0–0 · Double forfeit (0 pts each)";
    }
    const base = `${homeGoals} - ${awayGoals}`;
    if (resultKind === "HOME_WALKOVER" || resultKind === "AWAY_WALKOVER") {
      return `${base} · Forfeit`;
    }
    return overtimeWinner ? `${base} (OT)` : base;
  };

  return (
    <div className="fixtures-page space-y-6">
      <h2 className="page-title text-2xl font-black">Fixture List</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="muted text-xs">Showing published GameWeeks only (up to current available week).</p>
        <GameWeekJump rounds={leagueRounds.filter((round) => round <= maxVisibleRound)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold" href="/match-centre">
          Match Centre View
        </Link>
        <Link className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold" href="/supercomputer">
          Supercomputer View
        </Link>
        <Link className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold" href="/stats-hub">
          Stats Hub View
        </Link>
      </div>
      <section className="surface-card p-4">
        <p className="muted text-xs uppercase tracking-widest">Status Guide</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="stat-chip">Played = score submitted</span>
          <span className="stat-chip">Pending = still to play</span>
          <span className="stat-chip">OT = overtime winner set</span>
        </div>
      </section>
      {tournament.id === "preview-tournament" ? (
        <section className="surface-card border-amber-300/60 bg-amber-500/15 p-4">
          <p className="text-sm font-semibold text-amber-100">
            Preview mode: demo fixtures are shown while the live database is unavailable.
          </p>
        </section>
      ) : null}
      <section className="surface-card p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">League completion</p>
          <p className="muted text-xs">{completedLeagueCount}/{leagueFixtures.length} played</p>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-all duration-500"
            style={{ width: `${leagueCompletionPct}%` }}
          />
        </div>
        <p className="muted mt-2 text-xs">
          Remaining league-wide (full season): {pendingLeagueCount} · Still to play in published GameWeeks:{" "}
          {pendingVisibleCount}
        </p>
      </section>
      {leagueFixtures.length === 0 && knockoutFixtures.length === 0 ? (
        <p className="muted">No fixtures generated yet.</p>
      ) : (
        <div className="space-y-6">
          {leagueRounds
            .filter((round) => round <= maxVisibleRound)
            .map((round) => (
              <section key={round} id={`gw-${round}`} className="space-y-3 scroll-mt-24">
                <h3 className="text-xl font-bold text-cyan-100">GameWeek {round}</h3>
                {(byeByRound.get(round) ?? []).length > 0 ? (
                  <p className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100/90">
                    Bye week: {(byeByRound.get(round) ?? []).join(", ")}
                  </p>
                ) : null}
                {(fixturesByRound.get(round) ?? []).map((fixture) => {
                  const home = byId.get(fixture.homeParticipantId);
                  const away = byId.get(fixture.awayParticipantId);
                  const score = getScoreText(
                    fixture.homeGoals,
                    fixture.awayGoals,
                    fixture.overtimeWinner,
                    fixture.resultKind,
                  );
                  return (
                    <div key={fixture.id} className="surface-card fade-in-up p-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="muted text-xs uppercase tracking-widest">
                          League - GameWeek {fixture.round}
                        </p>
                        {fixture.homeGoals !== null && fixture.awayGoals !== null ? (
                          <span className="rounded-full border border-emerald-300/50 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-200">
                            Played
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-300/50 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-200">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-lg font-semibold">
                        (Home){" "}
                        <TeamName
                          name={home?.displayName ?? "TBD"}
                          primaryColor={home?.primaryColor}
                          secondaryColor={home?.secondaryColor}
                        />{" "}
                        {score}{" "}
                        <TeamName
                          name={away?.displayName ?? "TBD"}
                          primaryColor={away?.primaryColor}
                          secondaryColor={away?.secondaryColor}
                        />{" "}
                        (Away)
                      </p>
                      <p className="muted mt-1 text-sm">Venue: {home?.homeStadium ?? "TBD"}</p>
                      <p className="muted text-xs">{getDeadlineText(fixture.dueAt)}</p>
                      {fixture.homeGoals === null || fixture.awayGoals === null ? (
                        <p className="mt-2 text-xs text-cyan-100/90">
                          Supercomputer:{" "}
                          {(() => {
                            const prediction = predictionByFixtureId.get(fixture.id);
                            if (!prediction) return "Model unavailable";
                            return `${Math.round(prediction.homeWin * 100)}% home (reg) · ${Math.round(prediction.draw * 100)}% level (→ OT) · ${Math.round(prediction.awayWin * 100)}% away (reg)`;
                          })()}
                        </p>
                      ) : null}
                      {fixture.homeGoals !== null &&
                      fixture.awayGoals !== null &&
                      fixture.overtimeWinner ? (
                        <p className="mt-1 text-xs text-cyan-200">
                          Overtime winner: {fixture.overtimeWinner === "HOME" ? home?.displayName : away?.displayName}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ))}

          {firstLockedRound ? (
            <p className="muted text-sm">
              GameWeek {firstLockedRound + 1} will be revealed once all GameWeek {firstLockedRound} matches are completed.
            </p>
          ) : null}

          {knockoutFixtures.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-cyan-100">Knockout</h3>
                <p className="muted text-xs">
                  {completedKnockoutCount}/{knockoutFixtures.length} played
                </p>
              </div>
              {knockoutFixtures.map((fixture) => {
                const home = byId.get(fixture.homeParticipantId);
                const away = byId.get(fixture.awayParticipantId);
                const score = getScoreText(
                  fixture.homeGoals,
                  fixture.awayGoals,
                  fixture.overtimeWinner,
                  fixture.resultKind,
                );
                return (
                  <div key={fixture.id} className="surface-card fade-in-up p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="muted text-xs uppercase tracking-widest">Knockout - Round {fixture.round}</p>
                      {nextKnockoutRound === fixture.round ? (
                        <span className="rounded-full border border-cyan-300/60 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-cyan-100">
                          Live Round
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-lg font-semibold">
                      (Home){" "}
                      <TeamName
                        name={home?.displayName ?? "TBD"}
                        primaryColor={home?.primaryColor}
                        secondaryColor={home?.secondaryColor}
                      />{" "}
                      {score}{" "}
                      <TeamName
                        name={away?.displayName ?? "TBD"}
                        primaryColor={away?.primaryColor}
                        secondaryColor={away?.secondaryColor}
                      />{" "}
                      (Away)
                    </p>
                    <p className="muted mt-1 text-sm">Venue: {home?.homeStadium ?? "TBD"}</p>
                    <p className="muted text-xs">{getDeadlineText(fixture.dueAt)}</p>
                    {fixture.homeGoals !== null &&
                    fixture.awayGoals !== null &&
                    fixture.overtimeWinner ? (
                      <p className="mt-1 text-xs text-cyan-200">
                        Overtime winner: {fixture.overtimeWinner === "HOME" ? home?.displayName : away?.displayName}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
