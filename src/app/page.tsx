import Link from "next/link";
import { getTournamentData } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";
import { TeamName } from "@/components/team-name";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { participants, fixtures } = await getTournamentData();
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const completedLeague = leagueFixtures.filter((fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null);
  const table = computeLeagueTable(participants, leagueFixtures).slice(0, 4);
  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="surface-card fade-in-up p-5">
          <p className="muted text-xs uppercase tracking-widest">Participants</p>
          <p className="mt-1 text-4xl font-black">{participants.length}</p>
        </div>
        <div className="surface-card fade-in-up p-5">
          <p className="muted text-xs uppercase tracking-widest">League Matches Played</p>
          <p className="mt-1 text-4xl font-black">
            {completedLeague.length} / {leagueFixtures.length}
          </p>
        </div>
        <div className="surface-card fade-in-up p-5">
          <p className="muted text-xs uppercase tracking-widest">Knockout Matches</p>
          <p className="mt-1 text-4xl font-black">
            {fixtures.filter((fixture) => fixture.phase === "KNOCKOUT").length}
          </p>
        </div>
      </section>

      <section className="surface-card fade-in-up p-6">
        <h2 className="mb-4 text-xl font-semibold">Top of the Table</h2>
        <div className="space-y-2">
          {table.length === 0 ? (
            <p className="muted">No participants yet. Add players in Admin.</p>
          ) : (
            table.map((row, index) => (
              <div
                key={row.participantId}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/15 px-4 py-3"
              >
                <p className="font-medium">
                  #{index + 1}{" "}
                  <TeamName
                    name={row.team}
                    primaryColor={row.primaryColor}
                    secondaryColor={row.secondaryColor}
                  />
                </p>
                <p className="text-sm text-cyan-200">
                  {row.points} pts / GD {row.goalDifference}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link className="neo-button rounded-xl px-5 py-2.5 font-semibold" href="/fixtures">
          View Fixtures
        </Link>
        <Link className="neo-button rounded-xl px-5 py-2.5 font-semibold" href="/table">
          View League Table
        </Link>
        <Link className="neo-button rounded-xl px-5 py-2.5 font-semibold" href="/bracket">
          View Bracket
        </Link>
      </section>
    </div>
  );
}
