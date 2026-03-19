import { FixturePhase } from "@prisma/client";
import { getTournamentData } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";
import { TeamName } from "@/components/team-name";

export const dynamic = "force-dynamic";

export default async function TablePage() {
  const { participants, fixtures } = await getTournamentData();
  const table = computeLeagueTable(
    participants,
    fixtures.filter((fixture) => fixture.phase === FixturePhase.LEAGUE),
  );

  return (
    <div className="space-y-4">
      <h2 className="page-title text-2xl font-black">League Table</h2>
      <div className="surface-card overflow-x-auto p-2">
        <table className="w-full border-collapse text-left">
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
            {table.map((row, index) => (
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
      </div>
    </div>
  );
}
