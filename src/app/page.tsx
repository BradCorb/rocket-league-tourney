import Link from "next/link";
import { getTournamentData } from "@/lib/data";
import { computeLeagueTable } from "@/lib/tournament";

export const dynamic = "force-dynamic";

type NewsVariant = {
  label: string;
  toneClass: string;
  headline: (winner: string, loser: string, score: string) => string;
  body: (winner: string, roundLabel: string, winnerBefore: number, maxPotential: number) => string;
};

const leagueNewsVariants: NewsVariant[] = [
  {
    label: "Match Report",
    toneClass: "news-card--report",
    headline: (winner, loser, score) => `${winner} edges ${loser} ${score}`,
    body: (winner, roundLabel, winnerBefore, maxPotential) =>
      `${winner} started ${roundLabel} in #${winnerBefore} and could rise as high as #${maxPotential} depending on the remaining scores.`,
  },
  {
    label: "Result Flash",
    toneClass: "news-card--flash",
    headline: (winner, loser, score) => `${winner} takes down ${loser} ${score}`,
    body: (winner, roundLabel, winnerBefore, maxPotential) =>
      `Momentum shift: ${winner} banked points in ${roundLabel}. They were #${winnerBefore} pre-match and now have a path toward #${maxPotential}.`,
  },
  {
    label: "Paddock Wire",
    toneClass: "news-card--wire",
    headline: (winner, loser, score) => `${winner} secures the series over ${loser} ${score}`,
    body: (winner, roundLabel, winnerBefore, maxPotential) =>
      `Big result in ${roundLabel}: ${winner} adds another win to the run and could climb from #${winnerBefore} to #${maxPotential}.`,
  },
];

const knockoutNewsVariants: NewsVariant[] = [
  {
    label: "Gauntlet Update",
    toneClass: "news-card--gauntlet",
    headline: (winner, loser, score) => `${winner} knocks out ${loser} ${score}`,
    body: (winner, roundLabel) => `${roundLabel} is complete and ${winner} advances to the next challenge.`,
  },
  {
    label: "Bracket Bulletin",
    toneClass: "news-card--bulletin",
    headline: (winner, loser, score) => `${winner} survives ${loser} ${score}`,
    body: (winner, roundLabel) => `Another stage cleared: ${winner} moves on after a decisive ${roundLabel} finish.`,
  },
  {
    label: "Playoff Desk",
    toneClass: "news-card--desk",
    headline: (winner, loser, score) => `${winner} marches past ${loser} ${score}`,
    body: (winner, roundLabel) => `${winner} keeps the gauntlet run alive as ${roundLabel} closes out.`,
  },
];

function pickVariant<T>(items: T[], key: string): T {
  const value = key.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return items[value % items.length];
}

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
  const pendingLeagueFixtures = leagueFixtures.filter(
    (fixture) => fixture.homeGoals === null || fixture.awayGoals === null,
  );
  const nextDeadlineFixture = [...pendingLeagueFixtures]
    .filter((fixture) => fixture.dueAt !== null)
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity))[0];

  const articles = activeRoundFixtures.slice(0, 6).map((fixture) => {
    const home = byId.get(fixture.homeParticipantId);
    const away = byId.get(fixture.awayParticipantId);
    const homePosition = positionBefore.get(fixture.homeParticipantId) ?? participants.length;
    const awayPosition = positionBefore.get(fixture.awayParticipantId) ?? participants.length;
    const winnerId = fixture.homeGoals! > fixture.awayGoals! ? fixture.homeParticipantId : fixture.awayParticipantId;
    const winnerName = winnerId === fixture.homeParticipantId ? home?.displayName ?? "Home" : away?.displayName ?? "Away";
    const loserName = winnerId === fixture.homeParticipantId ? away?.displayName ?? "Away" : home?.displayName ?? "Home";
    const winnerBefore = winnerId === fixture.homeParticipantId ? homePosition : awayPosition;
    const loserBefore = winnerId === fixture.homeParticipantId ? awayPosition : homePosition;
    const maxPotential = Math.max(1, winnerBefore - 2);
    const score = `${fixture.homeGoals} - ${fixture.awayGoals}${fixture.overtimeWinner ? " (OT)" : ""}`;
    const winnerGoals = winnerId === fixture.homeParticipantId ? fixture.homeGoals ?? 0 : fixture.awayGoals ?? 0;
    const loserGoals = winnerId === fixture.homeParticipantId ? fixture.awayGoals ?? 0 : fixture.homeGoals ?? 0;
    const totalGoals = (fixture.homeGoals ?? 0) + (fixture.awayGoals ?? 0);
    const isUpset = winnerBefore > loserBefore;

    const variant = pickVariant(leagueNewsVariants, fixture.id);
    const headline = variant.headline(winnerName, loserName, score);
    const baseBody = variant.body(winnerName, `GameWeek ${activeRound}`, winnerBefore, maxPotential);
    const narrative =
      fixture.overtimeWinner
        ? `${winnerName} sealed it in overtime and adds a pressure win to the campaign.`
        : isUpset
          ? `Upset alert: #${winnerBefore} ${winnerName} took down #${loserBefore} ${loserName}.`
          : loserGoals === 0
            ? `${winnerName} posted a clean sheet and controlled the match from kickoff.`
            : totalGoals >= 6
              ? `Goal-fest: ${totalGoals} goals delivered one of the most open games of the week.`
              : winnerBefore <= 3
                ? `${winnerName} keeps the title race pace with another crucial result.`
                : `${winnerName} keeps climbing with another valuable three-point performance.`;
    const body = `${baseBody} ${narrative}`;
    const context = `Pre-match positions: ${home?.displayName ?? "Home"} #${homePosition}, ${away?.displayName ?? "Away"} #${awayPosition}.`;
    const storyTag = fixture.overtimeWinner
      ? "Overtime Drama"
      : isUpset
        ? "Upset"
        : loserGoals === 0
          ? "Clean Sheet"
          : totalGoals >= 6
            ? "High Scoring"
            : winnerGoals >= 4
              ? "Statement Win"
              : "Result";

    return {
      id: fixture.id,
      label: variant.label,
      toneClass: variant.toneClass,
      storyTag,
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
            const variant = pickVariant(knockoutNewsVariants, fixture.id);
            const isFinal = fixture.round === knockoutFixtures.length;
            const storyTag = isFinal
              ? "Final"
              : fixture.overtimeWinner
                ? "Knockout OT"
                : "Advancement";
            return {
              id: fixture.id,
              label: variant.label,
              toneClass: variant.toneClass,
              storyTag,
              headline: variant.headline(
                winnerName,
                loserName,
                `${fixture.homeGoals}-${fixture.awayGoals}${fixture.overtimeWinner ? " (OT)" : ""}`,
              ),
              body: `${variant.body(winnerName, `Gauntlet Round ${fixture.round}`, 0, 0)} ${isFinal ? `${winnerName} is crowned champion.` : `${winnerName} is one step closer to the crown.`}`,
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
      <section className="grid gap-4 md:grid-cols-2">
        <div className="surface-card p-5">
          <p className="muted text-xs uppercase tracking-widest">Season State</p>
          <p className="mt-2 text-sm">
            {leagueFixtures.length === 0
              ? "No fixtures generated yet. Start by generating league fixtures in Owner Admin."
              : completedLeague.length < leagueFixtures.length
                ? `League phase in progress: ${completedLeague.length}/${leagueFixtures.length} matches complete.`
                : tournament.status === "COMPLETE"
                  ? "Season complete. Champion and podium are locked."
                  : "League complete. Gauntlet phase is active."}
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="muted text-xs uppercase tracking-widest">Next Deadline</p>
          <p className="mt-2 text-sm">
            {nextDeadlineFixture?.dueAt
              ? `${new Date(nextDeadlineFixture.dueAt).toLocaleDateString()} - ${byId.get(nextDeadlineFixture.homeParticipantId)?.displayName ?? "Home"} vs ${byId.get(nextDeadlineFixture.awayParticipantId)?.displayName ?? "Away"}`
              : pendingLeagueFixtures.length > 0
                ? "Pending fixtures exist, but no due date is currently set."
                : tournament.status === "COMPLETE"
                  ? "Season finished. No upcoming deadlines."
                  : "No deadline available yet."}
          </p>
          {nextDeadlineFixture?.dueAt ? (
            <p className="mt-1 text-xs text-cyan-200/80">Deadline tracking is live on the fixtures page.</p>
          ) : null}
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
                className={`news-card rounded-lg border border-white/10 bg-black/15 px-4 py-3 ${article.toneClass}`}
                style={{ ["--delay" as string]: `${index * 90}ms` }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-200/85">
                  {article.label}
                </p>
                <span className="story-pill mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest">
                  {article.storyTag}
                </span>
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
