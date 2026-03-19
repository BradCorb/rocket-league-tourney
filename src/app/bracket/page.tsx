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
  const rounds = bracket.length;

  return (
    <div className="space-y-4">
      <h2 className="page-title text-2xl font-black">Gauntlet Bracket</h2>
      <p className="muted text-sm">
        Format: last vs second-last, then each winner plays the next higher seed at that seed&apos;s home venue.
      </p>
      <div className="space-y-4">
        {bracket.map((match, index) => {
          const hasResult = match.homeGoals !== null && match.homeGoals !== undefined && match.awayGoals !== null && match.awayGoals !== undefined;
          const homeWon = hasResult && match.winner?.id === match.home?.id;
          const awayWon = hasResult && match.winner?.id === match.away?.id;
          const homeLost = hasResult && match.home?.id && !homeWon;
          const awayLost = hasResult && match.away?.id && !awayWon;

          return (
            <section key={match.round} className="surface-card fade-in-up p-5">
              <p className="muted text-xs uppercase tracking-widest">
                {match.label} ({index + 1}/{rounds})
              </p>
              <p className="muted mt-1 text-xs">Home venue: {match.home?.homeStadium ?? "TBD"}</p>

              <div className="mt-3 space-y-2">
                <div
                  className={`rounded-md border px-3 py-2 ${
                    homeWon
                      ? "border-emerald-400/70 bg-emerald-700/30"
                      : homeLost
                        ? "border-rose-400/60 bg-rose-700/25"
                        : "border-white/20 bg-black/20"
                  }`}
                >
                  {homeLost ? (
                    <span className="font-semibold text-rose-300 line-through">
                      {match.home?.displayName ?? "TBD"}
                    </span>
                  ) : (
                    <TeamName
                      name={match.home?.displayName ?? "TBD"}
                      primaryColor={match.home?.primaryColor}
                      secondaryColor={match.home?.secondaryColor}
                    />
                  )}
                </div>
                <div
                  className={`rounded-md border px-3 py-2 ${
                    awayWon
                      ? "border-emerald-400/70 bg-emerald-700/30"
                      : awayLost
                        ? "border-rose-400/60 bg-rose-700/25"
                        : "border-white/20 bg-black/20"
                  }`}
                >
                  {awayLost ? (
                    <span className="font-semibold text-rose-300 line-through">
                      {match.away?.displayName ?? "TBD"}
                    </span>
                  ) : (
                    <TeamName
                      name={match.away?.displayName ?? "TBD"}
                      primaryColor={match.away?.primaryColor}
                      secondaryColor={match.away?.secondaryColor}
                    />
                  )}
                </div>
              </div>

              <p className="mt-3 text-sm text-cyan-100">
                {hasResult ? `Result: ${match.homeGoals} - ${match.awayGoals}` : "No result yet"}
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
            </section>
          );
        })}
      </div>
    </div>
  );
}
