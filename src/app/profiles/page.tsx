import Link from "next/link";
import { TeamName } from "@/components/team-name";
import { getTournamentDataReadOnly } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";
import { getRecentForm } from "@/lib/analytics";

export const dynamic = "force-dynamic";

function formTone(result: string) {
  if (result === "WF" || result === "LF" || result === "DF") {
    return "bg-black/65 text-white border-white/45";
  }
  if (result === "W") return "bg-emerald-500/18 text-emerald-200 border-emerald-300/45";
  if (result === "D") return "bg-amber-500/18 text-amber-200 border-amber-300/45";
  return "bg-rose-500/18 text-rose-200 border-rose-300/45";
}

function formText(result: string) {
  if (result === "WF") return "W";
  if (result === "LF") return "L";
  if (result === "DF") return "D";
  return result;
}

export default async function ProfilesPage() {
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const leagueRounds = [...new Set(leagueFixtures.map((fixture) => fixture.round))].sort((a, b) => a - b);
  const firstLockedRound =
    leagueRounds.find((round) =>
      leagueFixtures
        .filter((fixture) => fixture.round === round)
        .some((fixture) => fixture.status !== "COMPLETED"),
    ) ?? null;
  const maxVisibleRound =
    firstLockedRound ?? (leagueRounds.length > 0 ? leagueRounds[leagueRounds.length - 1] : 0);
  const visibleLeagueFixtures = leagueFixtures.filter((fixture) => fixture.round <= maxVisibleRound);
  const table = computeLeagueTable(
    participants,
    visibleLeagueFixtures,
  );
  const byId = new Map(participants.map((participant) => [participant.id, participant]));

  return (
    <div className="profiles-page space-y-6">
      <h2 className="page-title text-2xl font-black">Profiles</h2>
      <section className="grid gap-4 md:grid-cols-2">
        {table.map((row, index) => {
          const participant = byId.get(row.participantId);
          const form = getRecentForm(row.participantId, visibleLeagueFixtures, 5);
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
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="muted">Form:</span>
                {form.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {form.map((result, index) => (
                      <span
                        key={`${row.participantId}-${index}`}
                        className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border px-1 text-[10px] font-bold ${formTone(result)}`}
                      >
                        {formText(result)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span>-</span>
                )}
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
