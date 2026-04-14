import { TeamName } from "@/components/team-name";
import { getTournamentDataReadOnly } from "@/lib/data";
import { buildRacePanels, getCompletedFixtures, getLeagueFixtures } from "@/lib/analytics";
import { computeLeagueTable } from "@/lib/tournament";

export const dynamic = "force-dynamic";

export default async function StatsHubPage() {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const leagueFixtures = getLeagueFixtures(fixtures);
  const completedLeague = getCompletedFixtures(leagueFixtures);
  const table = computeLeagueTable(participants, leagueFixtures);
  const race = buildRacePanels(participants, fixtures);
  const biggestWin = [...completedLeague]
    .map((fixture) => ({
      fixture,
      margin: Math.abs((fixture.homeGoals ?? 0) - (fixture.awayGoals ?? 0)),
    }))
    .sort((a, b) => b.margin - a.margin)[0];
  const overtimeGames = completedLeague.filter((fixture) => fixture.overtimeWinner !== null).length;
  const shutouts = completedLeague.filter(
    (fixture) =>
      fixture.resultKind === "NORMAL" &&
      ((fixture.homeGoals ?? 0) === 0 || (fixture.awayGoals ?? 0) === 0),
  ).length;

  return (
    <div className="stats-hub-page space-y-6">
      <h2 className="page-title text-2xl font-black">Stats Hub</h2>
      <section className="surface-card grid gap-3 p-5 md:grid-cols-3">
        <div>
          <p className="muted text-xs uppercase tracking-widest">Fixtures Played</p>
          <p className="mt-1 text-3xl font-black">{completedLeague.length}</p>
        </div>
        <div>
          <p className="muted text-xs uppercase tracking-widest">Goals Scored</p>
          <p className="mt-1 text-3xl font-black">
            {completedLeague.reduce(
              (sum, fixture) => sum + (fixture.homeGoals ?? 0) + (fixture.awayGoals ?? 0),
              0,
            )}
          </p>
        </div>
        <div>
          <p className="muted text-xs uppercase tracking-widest">Avg Goals / Match</p>
          <p className="mt-1 text-3xl font-black">
            {completedLeague.length > 0
              ? (
                  completedLeague.reduce(
                    (sum, fixture) => sum + (fixture.homeGoals ?? 0) + (fixture.awayGoals ?? 0),
                    0,
                  ) / completedLeague.length
                ).toFixed(1)
              : "0.0"}
          </p>
        </div>
      </section>

      <section className="surface-card p-5">
        <p className="muted text-xs uppercase tracking-widest">Advanced Superlatives</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <p className="text-sm">
            Best attack:{" "}
            {race.bestAttack ? (
              <TeamName
                name={race.bestAttack.team}
                primaryColor={race.bestAttack.primaryColor}
                secondaryColor={race.bestAttack.secondaryColor}
              />
            ) : (
              "TBD"
            )}{" "}
            ({race.bestAttack?.goalsFor ?? 0} GF)
          </p>
          <p className="text-sm">
            Best defence:{" "}
            {race.bestDefence ? (
              <TeamName
                name={race.bestDefence.team}
                primaryColor={race.bestDefence.primaryColor}
                secondaryColor={race.bestDefence.secondaryColor}
              />
            ) : (
              "TBD"
            )}{" "}
            ({race.bestDefence?.goalsAgainst ?? 0} GA)
          </p>
          <p className="text-sm">
            Biggest win margin: {biggestWin ? biggestWin.margin : 0} goals
          </p>
          <p className="text-sm">Overtime games: {overtimeGames}</p>
          <p className="text-sm">Shutouts: {shutouts}</p>
          <p className="text-sm">
            Current leader:{" "}
            {race.titleRace[0] ? (
              <TeamName
                name={race.titleRace[0].team}
                primaryColor={race.titleRace[0].primaryColor}
                secondaryColor={race.titleRace[0].secondaryColor}
              />
            ) : (
              "TBD"
            )}
          </p>
        </div>
      </section>

      <section className="surface-card overflow-x-auto p-5">
        <p className="muted text-xs uppercase tracking-widest">Points Trend Board</p>
        <table className="mt-3 min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/15">
              <th className="p-2">Pos</th>
              <th className="p-2">Team</th>
              <th className="p-2">Pts</th>
              <th className="p-2">GD</th>
              <th className="p-2">GF</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, index) => (
              <tr key={row.participantId} className="border-b border-white/10">
                <td className="p-2">{index + 1}</td>
                <td className="p-2">
                  <TeamName
                    name={row.team}
                    primaryColor={row.primaryColor}
                    secondaryColor={row.secondaryColor}
                  />
                </td>
                <td className="p-2">{row.points}</td>
                <td className="p-2">{row.goalDifference}</td>
                <td className="p-2">{row.goalsFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
