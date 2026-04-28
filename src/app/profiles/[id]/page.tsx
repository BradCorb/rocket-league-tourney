import { notFound } from "next/navigation";
import { TeamName } from "@/components/team-name";
import { getTournamentDataReadOnly } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";
import { getRecentForm } from "@/lib/analytics";
import { getDisplayName } from "@/lib/display-name";

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
        .some((fixture) => fixture.status !== "COMPLETED"),
    ) ?? null;
  const maxVisibleRound =
    firstLockedRound ?? (leagueRounds.length > 0 ? leagueRounds[leagueRounds.length - 1] : 0);
  const visibleLeagueFixtures = leagueFixtures.filter((fixture) => fixture.round <= maxVisibleRound);
  const table = computeLeagueTable(participants, visibleLeagueFixtures);
  const rank = table.findIndex((row) => row.participantId === id) + 1;
  const row = table.find((entry) => entry.participantId === id);
  const recent = getRecentForm(id, visibleLeagueFixtures, 5);
  const playedFixtures = visibleLeagueFixtures
    .filter(
      (fixture) =>
        fixture.homeGoals !== null &&
        fixture.awayGoals !== null &&
        (fixture.homeParticipantId === id || fixture.awayParticipantId === id),
    )
    .sort((a, b) => {
      const aTime = a.playedAt ? new Date(a.playedAt).getTime() : 0;
      const bTime = b.playedAt ? new Date(b.playedAt).getTime() : 0;
      return bTime - aTime;
    });

  function matchResultTone(result: "W" | "D" | "L" | "WF" | "LF" | "DF") {
    if (result === "WF" || result === "LF" || result === "DF") {
      return "bg-black/65 text-white border-white/45";
    }
    if (result === "W") return "bg-emerald-500/18 text-emerald-200 border-emerald-300/45";
    if (result === "D") return "bg-amber-500/18 text-amber-200 border-amber-300/45";
    return "bg-rose-500/18 text-rose-200 border-rose-300/45";
  }

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
                  className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border px-1 text-[10px] font-bold ${formTone(result)}`}
                >
                  {formText(result)}
                </span>
              ))}
            </div>
          ) : (
            <span className="stat-chip">-</span>
          )}
        </div>
      </section>
      <section className="surface-card p-6">
        <p className="muted text-xs uppercase tracking-widest">Played matches (to current GameWeek)</p>
        {playedFixtures.length ? (
          <div className="mt-3 space-y-2">
            {playedFixtures.map((fixture) => {
              const isHome = fixture.homeParticipantId === id;
              const opponentId = isHome ? fixture.awayParticipantId : fixture.homeParticipantId;
              const opponent = participants.find((entry) => entry.id === opponentId);
              const goalsFor = isHome ? fixture.homeGoals ?? 0 : fixture.awayGoals ?? 0;
              const goalsAgainst = isHome ? fixture.awayGoals ?? 0 : fixture.homeGoals ?? 0;
              const resultKind = fixture.resultKind ?? "NORMAL";
              const result: "W" | "D" | "L" | "WF" | "LF" | "DF" =
                resultKind === "DOUBLE_FORFEIT"
                  ? "DF"
                  : resultKind === "HOME_WALKOVER"
                    ? isHome
                      ? "WF"
                      : "LF"
                    : resultKind === "AWAY_WALKOVER"
                      ? isHome
                        ? "LF"
                        : "WF"
                      : fixture.overtimeWinner !== null || goalsFor === goalsAgainst
                        ? "D"
                        : goalsFor > goalsAgainst
                          ? "W"
                          : "L";
              return (
                <div
                  key={fixture.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="muted text-xs">GW {fixture.round}</span>
                    <span>{isHome ? "vs" : "@"}</span>
                    <span className="font-semibold">
                      {getDisplayName(opponent?.displayName ?? "Unknown")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      {goalsFor}-{goalsAgainst}
                    </span>
                    <span
                      className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border px-1 text-[11px] font-bold ${matchResultTone(result)}`}
                    >
                      {formText(result)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted mt-3 text-sm">No played matches published yet.</p>
        )}
      </section>
    </div>
  );
}
