import Link from "next/link";
import { getTournamentData } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { participants, fixtures } = await getTournamentData();
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const completedLeague = leagueFixtures.filter((fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null);
  const byId = new Map(participants.map((participant) => [participant.id, participant]));

  const roundsWithResults = [...new Set(completedLeague.map((fixture) => fixture.round))].sort((a, b) => b - a);
  const activeRound = roundsWithResults[0] ?? null;

  const activeRoundFixtures = activeRound
    ? completedLeague
        .filter((fixture) => fixture.round === activeRound)
        .sort((a, b) => {
          const aTime = (a.playedAt ?? a.createdAt).getTime();
          const bTime = (b.playedAt ?? b.createdAt).getTime();
          return aTime - bTime;
        })
    : [];

  const fixturesBeforeRound = activeRound
    ? completedLeague.filter((fixture) => fixture.round < activeRound)
    : [];
  const standingsBeforeRound = computeLeagueTable(participants, fixturesBeforeRound);
  const positionBefore = new Map(
    standingsBeforeRound.map((row, index) => [row.participantId, index + 1]),
  );

  const articles = activeRoundFixtures.slice(0, 6).map((fixture) => {
    const home = byId.get(fixture.homeParticipantId);
    const away = byId.get(fixture.awayParticipantId);
    const homePosition = positionBefore.get(fixture.homeParticipantId) ?? participants.length;
    const awayPosition = positionBefore.get(fixture.awayParticipantId) ?? participants.length;
    const winnerId = fixture.homeGoals! > fixture.awayGoals! ? fixture.homeParticipantId : fixture.awayParticipantId;
    const winnerName = winnerId === fixture.homeParticipantId ? home?.displayName ?? "Home" : away?.displayName ?? "Away";
    const loserName = winnerId === fixture.homeParticipantId ? away?.displayName ?? "Away" : home?.displayName ?? "Home";
    const winnerBefore = winnerId === fixture.homeParticipantId ? homePosition : awayPosition;
    const maxPotential = Math.max(1, winnerBefore - 2);
    const score = `${fixture.homeGoals} - ${fixture.awayGoals}${fixture.overtimeWinner ? " (OT)" : ""}`;

    const headline = `${winnerName} beats ${loserName} ${score}`;
    const body = `${winnerName} came in at #${winnerBefore} before kickoff and could climb as high as #${maxPotential} once the rest of GameWeek ${activeRound} is complete.`;
    const context = `Pre-match positions: ${home?.displayName ?? "Home"} #${homePosition}, ${away?.displayName ?? "Away"} #${awayPosition}.`;

    return {
      id: fixture.id,
      headline,
      body,
      context,
    };
  });

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
        <h2 className="mb-2 text-xl font-semibold">GameWeek News</h2>
        <p className="muted mb-4 text-sm">
          {activeRound ? `Latest headlines from GameWeek ${activeRound}` : "Results headlines will appear once matches are completed."}
        </p>
        <div className="space-y-2">
          {articles.length === 0 ? (
            <p className="muted">No completed matches yet.</p>
          ) : (
            articles.map((article) => (
              <div
                key={article.id}
                className="rounded-lg border border-white/10 bg-black/15 px-4 py-3"
              >
                <p className="font-semibold text-cyan-100">{article.headline}</p>
                <p className="mt-1 text-sm">{article.body}</p>
                <p className="muted mt-1 text-xs">{article.context}</p>
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
