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
      <div className="surface-card overflow-x-auto p-4">
        <div className="flex min-w-max items-stretch gap-8 pr-4">
          {bracket.map((match, index) => {
            const hasResult = match.homeGoals !== null && match.homeGoals !== undefined && match.awayGoals !== null && match.awayGoals !== undefined;
            const homeLost = hasResult && match.winner?.id !== match.home?.id;
            const awayLost = hasResult && match.winner?.id !== match.away?.id;
            const connectorVisible = index < rounds - 1;

            return (
              <div key={match.round} className="relative w-80 shrink-0">
                <div className="fade-in-up rounded-xl border border-cyan-200/20 bg-black/25 p-4 shadow-lg">
                  <p className="muted text-xs uppercase tracking-widest">{match.label}</p>
                  <p className="muted mt-1 text-xs">Home venue: {match.home?.homeStadium ?? "TBD"}</p>

                  <div className="mt-3 space-y-2">
                    <div className={`rounded-md border px-3 py-2 ${homeLost ? "border-rose-400/60 bg-rose-700/25" : "border-white/20 bg-black/20"}`}>
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
                    <div className={`rounded-md border px-3 py-2 ${awayLost ? "border-rose-400/60 bg-rose-700/25" : "border-white/20 bg-black/20"}`}>
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
                </div>

                {connectorVisible ? (
                  <div className="pointer-events-none absolute right-[-34px] top-1/2 h-[2px] w-8 -translate-y-1/2 bg-cyan-300/60" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
