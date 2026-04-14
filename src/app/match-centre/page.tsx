import { getTournamentDataReadOnly } from "@/lib/data";
import { formatUkDate } from "@/lib/date-format";
import { TeamName } from "@/components/team-name";
import { findFeaturedFixture, getLeagueFixtures } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function MatchCentrePage() {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const leagueFixtures = getLeagueFixtures(fixtures).sort(
    (a, b) =>
      (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER),
  );
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

  const featured = findFeaturedFixture(participants, visibleLeagueFixtures);
  const pendingCount = visibleLeagueFixtures.filter(
    (fixture) => fixture.homeGoals === null || fixture.awayGoals === null,
  ).length;
  const playedCount = visibleLeagueFixtures.length - pendingCount;
  const activeRound = firstLockedRound ?? maxVisibleRound;
  const activeRoundFixtures = visibleLeagueFixtures.filter((fixture) => fixture.round === activeRound);
  const activeRoundPending = activeRoundFixtures.filter(
    (fixture) => fixture.homeGoals === null || fixture.awayGoals === null,
  );
  const activeRoundResults = [...activeRoundFixtures]
    .filter((fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null)
    .sort(
      (a, b) =>
        (b.playedAt ?? b.createdAt).getTime() - (a.playedAt ?? a.createdAt).getTime(),
    );

  return (
    <div className="match-centre-page space-y-6">
      <h2 className="page-title text-2xl font-black">Match Centre</h2>
      <section className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">Live match status</p>
          <div className="flex gap-2 text-xs">
            <span className="stat-chip">Played: {playedCount}</span>
            <span className="stat-chip">Pending: {pendingCount}</span>
            <span className="stat-chip">Active GW: {activeRound}</span>
          </div>
        </div>
      </section>

      {featured ? (
        <section className="surface-card p-5">
          <p className="muted text-xs uppercase tracking-widest">Featured Fixture</p>
          <p className="mt-2 text-xl font-bold">
            <TeamName
              name={featured.home?.displayName ?? "Home"}
              primaryColor={featured.home?.primaryColor}
              secondaryColor={featured.home?.secondaryColor}
            />{" "}
            vs{" "}
            <TeamName
              name={featured.away?.displayName ?? "Away"}
              primaryColor={featured.away?.primaryColor}
              secondaryColor={featured.away?.secondaryColor}
            />
          </p>
          <p className="muted mt-2 text-sm">
            Venue: {featured.home?.homeStadium ?? "TBD"} · Deadline:{" "}
            {featured.fixture.dueAt ? formatUkDate(featured.fixture.dueAt) : "Not set"}
          </p>
        </section>
      ) : null}

      <section className="surface-card p-5">
        <p className="muted text-xs uppercase tracking-widest">Deadline Radar · GameWeek {activeRound}</p>
        <div className="mt-3 space-y-2">
          {activeRoundPending.length === 0 ? (
            <p className="text-sm">All active GameWeek fixtures are completed.</p>
          ) : (
            activeRoundPending.map((fixture) => {
              const home = byId.get(fixture.homeParticipantId);
              const away = byId.get(fixture.awayParticipantId);
              return (
                <p key={fixture.id} className="text-sm">
                  <TeamName
                    name={home?.displayName ?? "Home"}
                    primaryColor={home?.primaryColor}
                    secondaryColor={home?.secondaryColor}
                  />{" "}
                  vs{" "}
                  <TeamName
                    name={away?.displayName ?? "Away"}
                    primaryColor={away?.primaryColor}
                    secondaryColor={away?.secondaryColor}
                  />{" "}
                  · {fixture.dueAt ? formatUkDate(fixture.dueAt) : "No deadline"}
                </p>
              );
            })
          )}
        </div>
      </section>

      <section className="space-y-3">
        <p className="muted text-xs uppercase tracking-widest">Latest Final Results · GameWeek {activeRound}</p>
        {activeRoundResults.map((fixture) => {
          const home = byId.get(fixture.homeParticipantId);
          const away = byId.get(fixture.awayParticipantId);
          return (
            <article key={fixture.id} className="surface-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="muted text-xs uppercase tracking-widest">
                  GameWeek {fixture.round}
                </p>
                <span className="stat-chip">Final</span>
              </div>
              <p className="mt-2 text-lg font-semibold">
                <TeamName
                  name={home?.displayName ?? "Home"}
                  primaryColor={home?.primaryColor}
                  secondaryColor={home?.secondaryColor}
                />{" "}
                {`${fixture.homeGoals} - ${fixture.awayGoals}`}{" "}
                <TeamName
                  name={away?.displayName ?? "Away"}
                  primaryColor={away?.primaryColor}
                  secondaryColor={away?.secondaryColor}
                />
              </p>
              <p className="muted mt-1 text-sm">
                {home?.homeStadium ?? "TBD"} ·{" "}
                {fixture.dueAt ? `Deadline ${formatUkDate(fixture.dueAt)}` : "Deadline not set"}
              </p>
            </article>
          );
        })}
        {activeRoundResults.length === 0 ? <p className="muted text-sm">No final results yet in this GameWeek.</p> : null}
      </section>
    </div>
  );
}
