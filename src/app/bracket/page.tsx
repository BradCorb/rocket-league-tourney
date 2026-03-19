import { getTournamentData } from "@/lib/data";
import { buildGauntletBracket, computeLeagueTable } from "@/lib/tournament";
import { TeamName } from "@/components/team-name";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  const { participants, fixtures } = await getTournamentData();
  const standings = computeLeagueTable(
    participants,
    fixtures.filter((fixture) => fixture.phase === "LEAGUE"),
  );
  const bracket = buildGauntletBracket(
    standings,
    participants,
    fixtures.filter((fixture) => fixture.phase === "KNOCKOUT"),
  );

  return (
    <div className="space-y-4">
      <h2 className="page-title text-2xl font-black">Gauntlet Bracket</h2>
      <p className="muted text-sm">
        Format: 3rd vs 4th, winner vs 2nd, winner vs 1st
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {bracket.map((match) => (
          <div key={match.round} className="surface-card fade-in-up p-5">
            <p className="muted text-xs uppercase tracking-widest">{match.label}</p>
            <p className="mt-2 text-lg font-semibold">
              <TeamName
                name={match.home?.displayName ?? "TBD"}
                primaryColor={match.home?.primaryColor}
                secondaryColor={match.home?.secondaryColor}
              />{" "}
              vs{" "}
              <TeamName
                name={match.away?.displayName ?? "TBD"}
                primaryColor={match.away?.primaryColor}
                secondaryColor={match.away?.secondaryColor}
              />
            </p>
            <p className="muted text-sm">Home venue: {match.home?.homeStadium ?? "TBD"}</p>
            <p className="mt-2 text-cyan-100">
              {match.homeGoals === undefined || match.awayGoals === undefined || match.homeGoals === null || match.awayGoals === null
                ? "No result yet"
                : `Result: ${match.homeGoals} - ${match.awayGoals}`}
            </p>
            <p className="mt-1 text-sm">
              Winner:{" "}
              {match.winner ? (
                <TeamName
                  name={match.winner.displayName}
                  primaryColor={match.winner.primaryColor}
                  secondaryColor={match.winner.secondaryColor}
                />
              ) : (
                "TBD"
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
