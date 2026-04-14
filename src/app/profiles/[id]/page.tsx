import { notFound } from "next/navigation";
import { TeamName } from "@/components/team-name";
import { getTournamentDataReadOnly } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";
import { getRecentForm } from "@/lib/analytics";

export const dynamic = "force-dynamic";

function formTone(result: string) {
  if (result === "W") return "bg-emerald-500/18 text-emerald-200 border-emerald-300/45";
  if (result === "D") return "bg-amber-500/18 text-amber-200 border-amber-300/45";
  return "bg-rose-500/18 text-rose-200 border-rose-300/45";
}

type ProfilePageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProfileDetailPage({ params }: ProfilePageProps) {
  const { id } = await params;
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const participant = participants.find((entry) => entry.id === id);
  if (!participant) notFound();

  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
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
  const table = computeLeagueTable(participants, visibleLeagueFixtures);
  const rank = table.findIndex((row) => row.participantId === id) + 1;
  const row = table.find((entry) => entry.participantId === id);
  const recent = getRecentForm(id, visibleLeagueFixtures, 5);

  return (
    <div className="profiles-page space-y-6">
      <h2 className="page-title text-2xl font-black">Profile Centre</h2>
      <section className="surface-card p-6">
        <p className="muted text-xs uppercase tracking-widest">Team profile</p>
        <p className="mt-2 text-3xl font-black">
          <TeamName
            name={participant.displayName}
            primaryColor={participant.primaryColor}
            secondaryColor={participant.secondaryColor}
          />
        </p>
        <p className="muted mt-2 text-sm">Home stadium: {participant.homeStadium}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="stat-chip">Rank #{rank > 0 ? rank : "-"}</span>
          <span className="stat-chip">Pts {row?.points ?? 0}</span>
          <span className="stat-chip">GD {row?.goalDifference ?? 0}</span>
          <span className="stat-chip">Form</span>
          {recent.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {recent.map((result, index) => (
                <span
                  key={`${participant.id}-${index}`}
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${formTone(result)}`}
                >
                  {result}
                </span>
              ))}
            </div>
          ) : (
            <span className="stat-chip">-</span>
          )}
        </div>
      </section>
    </div>
  );
}
