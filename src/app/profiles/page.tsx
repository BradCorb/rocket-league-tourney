import Link from "next/link";
import { TeamName } from "@/components/team-name";
import { getTournamentDataReadOnly } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";
import { getRecentForm } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const table = computeLeagueTable(
    participants,
    fixtures.filter((fixture) => fixture.phase === "LEAGUE"),
  );
  const byId = new Map(participants.map((participant) => [participant.id, participant]));

  return (
    <div className="profiles-page space-y-6">
      <h2 className="page-title text-2xl font-black">Profiles</h2>
      <section className="grid gap-4 md:grid-cols-2">
        {table.map((row, index) => {
          const participant = byId.get(row.participantId);
          const form = getRecentForm(row.participantId, fixtures, 5);
          return (
            <Link
              key={row.participantId}
              href={`/profiles/${row.participantId}`}
              className="surface-card block p-5 transition hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between">
                <p className="muted text-xs uppercase tracking-widest">Rank #{index + 1}</p>
                <span className="stat-chip">{row.points} pts</span>
              </div>
              <p className="mt-2 text-lg font-semibold">
                <TeamName
                  name={participant?.displayName ?? row.team}
                  primaryColor={participant?.primaryColor}
                  secondaryColor={participant?.secondaryColor}
                />
              </p>
              <p className="muted mt-1 text-sm">
                Home arena: {participant?.homeStadium ?? "TBD"} · GD {row.goalDifference}
              </p>
              <p className="mt-2 text-xs">Form: {form.join(" ") || "-"}</p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
