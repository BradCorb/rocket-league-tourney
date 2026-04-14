import { notFound } from "next/navigation";
import { TeamName } from "@/components/team-name";
import { getTournamentDataReadOnly } from "@/lib/data";
import { formatUkDate } from "@/lib/date-format";
import { computeLeagueTable } from "@/lib/tournament";
import { getRecentForm } from "@/lib/analytics";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProfileDetailPage({ params }: ProfilePageProps) {
  const { id } = await params;
  const { participants, fixtures } = await getTournamentDataReadOnly();
  const participant = participants.find((entry) => entry.id === id);
  if (!participant) notFound();

  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const table = computeLeagueTable(participants, leagueFixtures);
  const rank = table.findIndex((row) => row.participantId === id) + 1;
  const row = table.find((entry) => entry.participantId === id);
  const matches = leagueFixtures
    .filter(
      (fixture) => fixture.homeParticipantId === id || fixture.awayParticipantId === id,
    )
    .sort(
      (a, b) =>
        (b.playedAt ?? b.createdAt).getTime() - (a.playedAt ?? a.createdAt).getTime(),
    )
    .slice(0, 8);
  const recent = getRecentForm(id, fixtures, 5);

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
          <span className="stat-chip">Form {recent.join(" ") || "-"}</span>
        </div>
      </section>

      <section className="surface-card p-5">
        <p className="muted text-xs uppercase tracking-widest">Recent fixtures</p>
        <div className="mt-3 space-y-2">
          {matches.map((fixture) => {
            const home = participants.find((entry) => entry.id === fixture.homeParticipantId);
            const away = participants.find((entry) => entry.id === fixture.awayParticipantId);
            const score =
              fixture.homeGoals === null || fixture.awayGoals === null
                ? "vs"
                : `${fixture.homeGoals} - ${fixture.awayGoals}`;
            return (
              <article key={fixture.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-sm font-semibold">
                  <TeamName
                    name={home?.displayName ?? "Home"}
                    primaryColor={home?.primaryColor}
                    secondaryColor={home?.secondaryColor}
                  />{" "}
                  {score}{" "}
                  <TeamName
                    name={away?.displayName ?? "Away"}
                    primaryColor={away?.primaryColor}
                    secondaryColor={away?.secondaryColor}
                  />
                </p>
                <p className="muted mt-1 text-xs">
                  GameWeek {fixture.round} ·{" "}
                  {fixture.dueAt ? `Deadline ${formatUkDate(fixture.dueAt)}` : "Deadline not set"}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
