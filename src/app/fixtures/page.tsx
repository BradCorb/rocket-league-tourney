import { getTournamentData } from "@/lib/data";
import { TeamName } from "@/components/team-name";

export const dynamic = "force-dynamic";

export default async function FixturesPage() {
  const { participants, fixtures } = await getTournamentData();
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
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

  const fixturesByRound = new Map<number, typeof visibleLeagueFixtures>();
  for (const fixture of visibleLeagueFixtures) {
    const list = fixturesByRound.get(fixture.round) ?? [];
    list.push(fixture);
    fixturesByRound.set(fixture.round, list);
  }

  const getDeadlineText = (dueAt: Date | null) => {
    return dueAt
      ? `Deadline: ${dueAt.toLocaleDateString()}`
      : "Deadline: not set";
  };

  const getScoreText = (
    homeGoals: number | null,
    awayGoals: number | null,
    overtimeWinner: "HOME" | "AWAY" | null,
  ) => {
    if (homeGoals === null || awayGoals === null) return "vs";
    const base = `${homeGoals} - ${awayGoals}`;
    return overtimeWinner ? `${base} (OT)` : base;
  };

  return (
    <div className="space-y-6">
      <h2 className="page-title text-2xl font-black">Fixture List</h2>
      {leagueFixtures.length === 0 && knockoutFixtures.length === 0 ? (
        <p className="muted">No fixtures generated yet.</p>
      ) : (
        <div className="space-y-6">
          {leagueRounds
            .filter((round) => round <= maxVisibleRound)
            .map((round) => (
              <section key={round} className="space-y-3">
                <h3 className="text-xl font-bold text-cyan-100">GameWeek {round}</h3>
                {(fixturesByRound.get(round) ?? []).map((fixture) => {
                  const home = byId.get(fixture.homeParticipantId);
                  const away = byId.get(fixture.awayParticipantId);
                  const score = getScoreText(
                    fixture.homeGoals,
                    fixture.awayGoals,
                    fixture.overtimeWinner,
                  );
                  return (
                    <div key={fixture.id} className="surface-card fade-in-up p-5">
                      <p className="muted text-xs uppercase tracking-widest">
                        League - GameWeek {fixture.round}
                      </p>
                      <p className="mt-2 text-lg font-semibold">
                        <TeamName
                          name={home?.displayName ?? "TBD"}
                          primaryColor={home?.primaryColor}
                          secondaryColor={home?.secondaryColor}
                        />{" "}
                        (Home) {score}{" "}
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
            ))}

          {firstLockedRound ? (
            <p className="muted text-sm">
              GameWeek {firstLockedRound + 1} will be revealed once all GameWeek {firstLockedRound} matches are completed.
            </p>
          ) : null}

          {knockoutFixtures.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-xl font-bold text-cyan-100">Knockout</h3>
              {knockoutFixtures.map((fixture) => {
                const home = byId.get(fixture.homeParticipantId);
                const away = byId.get(fixture.awayParticipantId);
                const score = getScoreText(
                  fixture.homeGoals,
                  fixture.awayGoals,
                  fixture.overtimeWinner,
                );
                return (
                  <div key={fixture.id} className="surface-card fade-in-up p-5">
                    <p className="muted text-xs uppercase tracking-widest">Knockout - Round {fixture.round}</p>
                    <p className="mt-2 text-lg font-semibold">
                      <TeamName
                        name={home?.displayName ?? "TBD"}
                        primaryColor={home?.primaryColor}
                        secondaryColor={home?.secondaryColor}
                      />{" "}
                      (Home) {score}{" "}
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
