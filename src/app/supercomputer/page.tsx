import { TeamName } from "@/components/team-name";
import { SupercomputerLiveRefresh } from "@/components/supercomputer-live-refresh";
import { getTournamentDataReadOnly } from "@/lib/data";
import { runSupercomputer } from "@/lib/supercomputer";
import { computeLeagueTable } from "@/lib/tournament";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default async function SupercomputerPage() {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const supercomputer = runSupercomputer(participants, fixtures, 10000);
  const table = computeLeagueTable(
    participants,
    fixtures.filter((fixture) => fixture.phase === "LEAGUE" && fixture.round <= supercomputer.maxVisibleRound),
  );
  const projectionById = new Map(
    supercomputer.tableProjections.map((projection) => [projection.participantId, projection]),
  );
  const upcomingVisible = fixtures
    .filter(
      (fixture) =>
        fixture.phase === "LEAGUE" &&
        fixture.round <= supercomputer.maxVisibleRound &&
        (fixture.homeGoals === null || fixture.awayGoals === null),
    )
    .sort((a, b) => (a.round !== b.round ? a.round - b.round : a.createdAt.getTime() - b.createdAt.getTime()));
  const predictionByFixture = new Map(
    supercomputer.fixturePredictions.map((prediction) => [prediction.fixtureId, prediction]),
  );
  const totalPositions = participants.length;

  return (
    <div className="space-y-6">
      <h2 className="page-title text-2xl font-black">Supercomputer</h2>
      <section className="surface-card p-5">
        <p className="muted text-xs uppercase tracking-widest">Model details</p>
        <p className="mt-2 text-sm">
          10,000 Monte Carlo seasons over the entire remaining league schedule. Future GameWeeks are simulated only on
          the server for math — the site still hides unreleased fixtures elsewhere. Strength uses opponent-adjusted
          home and away attack and defence, head-to-head goal margins where you have met already, and Poisson goal
          models. Each simulated season draws latent team form noise with partial pooling: uncertainty is high early
          and tightens as more results land (same spirit as hierarchical shrinkage and uncertain ratings in major
          league projection systems). Nothing is written to the database.
        </p>
        <p className="muted mt-2 text-xs">
          Model snapshot: {supercomputer.modelInfo.completedLeagueMatches} results in ·{" "}
          {supercomputer.modelInfo.remainingLeagueFixturesSimulated} fixtures left to simulate · epistemic σ ≈{" "}
          {supercomputer.modelInfo.epistemicSigma.toFixed(3)} (lower = more confident as the season progresses).
        </p>
        <SupercomputerLiveRefresh />
      </section>

      <section className="surface-card overflow-x-auto p-4">
        <h3 className="text-lg font-semibold">Projected Table Outcomes</h3>
        <table className="mt-3 min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/15 text-cyan-100/90">
              <th className="p-2">Now</th>
              <th className="p-2">Team</th>
              <th className="p-2">Title chance</th>
              <th className="p-2">Top 3 chance</th>
              <th className="p-2">Avg finish</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, index) => {
              const projection = projectionById.get(row.participantId);
              return (
                <tr key={row.participantId} className="border-b border-white/10">
                  <td className="p-2 font-bold">{index + 1}</td>
                  <td className="p-2">
                    <TeamName
                      name={row.team}
                      primaryColor={row.primaryColor}
                      secondaryColor={row.secondaryColor}
                    />
                  </td>
                  <td className="p-2">{asPercent(projection?.titleChance ?? 0)}</td>
                  <td className="p-2">{asPercent(projection?.top3Chance ?? 0)}</td>
                  <td className="p-2">{(projection?.avgFinish ?? participants.length).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="surface-card overflow-x-auto p-4">
        <h3 className="text-lg font-semibold">Full Position Finish Matrix</h3>
        <p className="muted mt-1 text-xs">
          Percentage chance each team finishes in each exact league position, based on all current completed data plus
          10,000 full-season simulations.
        </p>
        <table className="mt-3 min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/15 text-cyan-100/90">
              <th className="p-2">Team</th>
              {Array.from({ length: totalPositions }, (_, index) => (
                <th key={`pos-${index + 1}`} className="p-2">
                  {index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((row) => {
              const projection = projectionById.get(row.participantId);
              const chances = projection?.finishPositionChances ?? new Array(totalPositions).fill(0);
              return (
                <tr key={`matrix-${row.participantId}`} className="border-b border-white/10">
                  <td className="p-2 font-semibold">
                    <TeamName
                      name={row.team}
                      primaryColor={row.primaryColor}
                      secondaryColor={row.secondaryColor}
                    />
                  </td>
                  {chances.map((chance, index) => (
                    <td key={`${row.participantId}-pos-${index + 1}`} className="p-2">
                      {asPercent(chance)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="surface-card p-5">
        <h3 className="text-lg font-semibold">Upcoming Fixture Probabilities</h3>
        <div className="mt-3 space-y-3">
          {upcomingVisible.length === 0 ? (
            <p className="muted text-sm">No upcoming fixtures in currently visible GameWeeks.</p>
          ) : (
            upcomingVisible.map((fixture) => {
              const home = byId.get(fixture.homeParticipantId);
              const away = byId.get(fixture.awayParticipantId);
              const prediction = predictionByFixture.get(fixture.id);
              return (
                <article key={fixture.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-semibold">
                    GW {fixture.round}:{" "}
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
                    />
                  </p>
                  <p className="muted mt-1 text-xs">
                    {prediction
                      ? `${Math.round(prediction.homeWin * 100)}% home (reg) · ${Math.round(prediction.draw * 100)}% level (→ OT) · ${Math.round(prediction.awayWin * 100)}% away (reg)`
                      : "Prediction unavailable"}
                  </p>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
