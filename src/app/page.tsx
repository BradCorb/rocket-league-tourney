import Link from "next/link";
import { getTournamentData } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { tournament, participants, fixtures } = await getTournamentData();
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const knockoutFixtures = fixtures
    .filter((fixture) => fixture.phase === "KNOCKOUT")
    .sort((a, b) => a.round - b.round);
  const completedLeague = leagueFixtures.filter((fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null);
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const standings = computeLeagueTable(participants, leagueFixtures);

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

  const completedKnockout = knockoutFixtures.filter(
    (fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null,
  );
  const latestKnockoutRound = completedKnockout.length > 0 ? completedKnockout[completedKnockout.length - 1].round : null;
  const knockoutArticles =
    latestKnockoutRound === null
      ? []
      : completedKnockout
          .filter((fixture) => fixture.round === latestKnockoutRound)
          .map((fixture) => {
            const home = byId.get(fixture.homeParticipantId);
            const away = byId.get(fixture.awayParticipantId);
            const winnerIsHome = (fixture.homeGoals ?? 0) > (fixture.awayGoals ?? 0);
            const winnerName = winnerIsHome ? home?.displayName ?? "Home" : away?.displayName ?? "Away";
            const loserName = winnerIsHome ? away?.displayName ?? "Away" : home?.displayName ?? "Home";
            return {
              id: fixture.id,
              headline: `${winnerName} advances past ${loserName} ${fixture.homeGoals}-${fixture.awayGoals}${fixture.overtimeWinner ? " (OT)" : ""}`,
              body: `Gauntlet Round ${fixture.round} is complete and ${winnerName} moves on to the next stage.`,
              context: `${home?.displayName ?? "Home"} vs ${away?.displayName ?? "Away"}`,
            };
          });

  const finalMatch = knockoutFixtures.length > 0 ? knockoutFixtures[knockoutFixtures.length - 1] : null;
  const finalComplete =
    tournament.status === "COMPLETE" &&
    finalMatch &&
    finalMatch.homeGoals !== null &&
    finalMatch.awayGoals !== null;
  const winnerId =
    finalComplete && finalMatch
      ? finalMatch.homeGoals! > finalMatch.awayGoals!
        ? finalMatch.homeParticipantId
        : finalMatch.awayParticipantId
      : null;
  const runnerUpId =
    finalComplete && finalMatch
      ? finalMatch.homeGoals! > finalMatch.awayGoals!
        ? finalMatch.awayParticipantId
        : finalMatch.homeParticipantId
      : null;
  const champion = winnerId ? byId.get(winnerId) : null;
  const runnerUp = runnerUpId ? byId.get(runnerUpId) : null;
  const third = standings[2] ? byId.get(standings[2].participantId) : null;

  return (
    <div className="space-y-8">
      {tournament.id === "preview-tournament" ? (
        <section className="surface-card border-amber-300/60 bg-amber-500/15 p-4">
          <p className="text-sm font-semibold text-amber-100">
            Preview mode: showing demo data because live database is currently unavailable.
          </p>
        </section>
      ) : null}
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
        <h2 className="mb-2 text-xl font-semibold">
          {completedKnockout.length > 0 ? "Gauntlet News" : "GameWeek News"}
        </h2>
        <p className="muted mb-4 text-sm">
          {completedKnockout.length > 0
            ? `Latest headlines from Gauntlet Round ${latestKnockoutRound}`
            : activeRound
              ? `Latest headlines from GameWeek ${activeRound}`
              : "Results headlines will appear once matches are completed."}
        </p>
        <div className="space-y-3">
          {(completedKnockout.length > 0 ? knockoutArticles : articles).length === 0 ? (
            <p className="muted">No completed matches yet.</p>
          ) : (
            (completedKnockout.length > 0 ? knockoutArticles : articles).map((article, index) => (
              <div
                key={article.id}
                className="news-card rounded-lg border border-white/10 bg-black/15 px-4 py-3"
                style={{ ["--delay" as string]: `${index * 90}ms` }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-200/85">
                  Match Report
                </p>
                <p className="mt-1 font-semibold text-cyan-100">{article.headline}</p>
                <p className="mt-1 text-sm">{article.body}</p>
                <p className="muted mt-1 text-xs">{article.context}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {finalComplete && champion ? (
        <section className="surface-card fade-in-up p-6">
          <h2 className="mb-2 text-xl font-semibold">Final Podium</h2>
          <p className="muted mb-4 text-sm">Tournament complete - crown secured.</p>
          <div className="podium-wrap grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="muted text-xs uppercase tracking-widest">2nd Place</p>
              <p className="mt-1 text-lg font-semibold">{runnerUp?.displayName ?? "TBD"}</p>
            </div>
            <div className="podium-first rounded-xl border border-amber-300/60 bg-amber-300/15 p-4 text-center">
              <div className="confetti-burst" />
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-100">Champion</p>
              <p className="mt-1 text-2xl font-black text-amber-100">{champion.displayName}</p>
              <p className="mt-2 text-xs text-amber-100/90">Season Winner</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="muted text-xs uppercase tracking-widest">3rd Place</p>
              <p className="mt-1 text-lg font-semibold">{third?.displayName ?? "TBD"}</p>
            </div>
          </div>
        </section>
      ) : null}

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
