import { getTournamentData } from "@/lib/data";
import { TeamName } from "@/components/team-name";

export const dynamic = "force-dynamic";

export default async function FixturesPage() {
  const { participants, fixtures } = await getTournamentData();
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const ordered = [...fixtures].sort((a, b) => {
    if (a.phase !== b.phase) return a.phase.localeCompare(b.phase);
    if (a.round !== b.round) return a.round - b.round;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return (
    <div className="space-y-6">
      <h2 className="page-title text-2xl font-black">Fixture List</h2>
      {ordered.length === 0 ? (
        <p className="muted">No fixtures generated yet.</p>
      ) : (
        ordered.map((fixture) => {
          const home = byId.get(fixture.homeParticipantId);
          const away = byId.get(fixture.awayParticipantId);
          const score =
            fixture.homeGoals === null || fixture.awayGoals === null
              ? "vs"
              : `${fixture.homeGoals} - ${fixture.awayGoals}`;
          return (
            <div key={fixture.id} className="surface-card fade-in-up p-5">
              <p className="muted text-xs uppercase tracking-widest">
                {fixture.phase === "LEAGUE" ? "League" : "Knockout"} - Round {fixture.round}
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
              <p className="muted mt-1 text-sm">
                Venue: {home?.homeStadium ?? "TBD"}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
