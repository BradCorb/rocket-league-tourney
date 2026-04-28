import Link from "next/link";
import { getTournamentDataReadOnly } from "@/lib/data";
import { formatUkDate } from "@/lib/date-format";
import { buildRacePanels, findFeaturedFixture } from "@/lib/analytics";
import { computeLeagueTable } from "@/lib/tournament";
import { getDisplayName } from "@/lib/display-name";

export const dynamic = "force-dynamic";

type StoryTemplate = {
  label: string;
  toneClass: string;
  headline: (winner: string, loser: string, score: string) => string;
};

const leagueStoryTemplates: StoryTemplate[] = [
  {
    label: "Match Report",
    toneClass: "news-card--report",
    headline: (winner, loser, score) => `${winner} edges ${loser} ${score}`,
  },
  {
    label: "Result Flash",
    toneClass: "news-card--flash",
    headline: (winner, loser, score) => `${winner} takes down ${loser} ${score}`,
  },
  {
    label: "Paddock Wire",
    toneClass: "news-card--wire",
    headline: (winner, loser, score) => `${winner} secures the series over ${loser} ${score}`,
  },
  {
    label: "League Desk",
    toneClass: "news-card--desk",
    headline: (winner, loser, score) => `${winner} banked a statement win over ${loser} ${score}`,
  },
  {
    label: "Boot Room",
    toneClass: "news-card--flash",
    headline: (winner, loser, score) => `BOOM: ${winner} detonates on ${loser} — ${score}`,
  },
  {
    label: "Press Box",
    toneClass: "news-card--report",
    headline: (winner, loser, score) => `${winner} steals the headline over ${loser} (${score})`,
  },
  {
    label: "Sideline",
    toneClass: "news-card--wire",
    headline: (winner, loser, score) => `Full time: ${winner} outlasts ${loser} ${score}`,
  },
];

const leagueSceneHooks: Array<(venue: string, winner: string, loser: string) => string> = [
  (venue, winner, loser) =>
    `Under the lights at ${venue}, ${winner} and ${loser} traded momentum until someone blinked.`,
  (venue, winner, loser) =>
    `${venue} turned into a pressure cooker — ${winner} and ${loser} left boost on the field.`,
  (venue, winner, loser) =>
    `The crowd at ${venue} got their money's worth: ${winner} vs ${loser}, no half measures.`,
  (venue, winner, loser) =>
    `From kickoff at ${venue}, this one had "season implications" written all over it for ${winner} and ${loser}.`,
  (venue, winner, loser) =>
    `${venue} hosted a straight fight: ${loser} threw everything forward, ${winner} found the answers.`,
];

const leagueMomentumHooks: Array<(winner: string, loser: string, isUpset: boolean) => string> = [
  (winner, loser, isUpset) =>
    isUpset
      ? `${winner} ripped up the form guide and left ${loser} chasing shadows.`
      : `${winner} controlled the pace and kept ${loser} reacting.`,
  (winner, loser, isUpset) =>
    isUpset
      ? `${loser} came in favored, but ${winner} flipped the script and owned the key moments.`
      : `${winner} made the cleaner touches under pressure while ${loser} faded late.`,
  (winner, loser, isUpset) =>
    isUpset
      ? `This was not in the forecast: ${winner} blindsided ${loser} with a full-throttle display.`
      : `${winner} stayed sharp in transition and never let ${loser} settle.`,
];

const leagueCloserHooks: Array<(winner: string, round: number | null) => string> = [
  (winner, round) => `${winner} closes another chapter in GameWeek ${round ?? "?"} with table points that sting.`,
  (winner, round) => `GameWeek ${round ?? "?"} keeps boiling over, and ${winner} just turned up the heat.`,
  (winner) => `${winner} leaves the arena with the result and all the noise.`,
];

const knockoutStoryTemplates: StoryTemplate[] = [
  {
    label: "Gauntlet Update",
    toneClass: "news-card--gauntlet",
    headline: (winner, loser, score) => `${winner} knocks out ${loser} ${score}`,
  },
  {
    label: "Bracket Bulletin",
    toneClass: "news-card--bulletin",
    headline: (winner, loser, score) => `${winner} survives ${loser} ${score}`,
  },
  {
    label: "Playoff Desk",
    toneClass: "news-card--desk",
    headline: (winner, loser, score) => `${winner} marches past ${loser} ${score}`,
  },
];

function pickVariant<T>(items: T[], key: string): T {
  const value = key.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return items[value % items.length];
}

export default async function Home() {
  const { tournament, participants, fixtures } = await getTournamentDataReadOnly();
  const leagueFixtures = fixtures.filter((fixture) => fixture.phase === "LEAGUE");
  const knockoutFixtures = fixtures
    .filter((fixture) => fixture.phase === "KNOCKOUT")
    .sort((a, b) => a.round - b.round);
  const completedLeague = leagueFixtures.filter((fixture) => fixture.status === "COMPLETED");
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const standings = computeLeagueTable(participants, leagueFixtures);
  const race = buildRacePanels(participants, fixtures);
  const featuredFixture = findFeaturedFixture(participants, fixtures);

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
    (fixture) => fixture.status !== "COMPLETED",
  );
  const nextDeadlineFixture = [...pendingLeagueFixtures]
    .filter((fixture) => fixture.dueAt !== null)
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity))[0];

  const orderedRoundFixtures = [...activeRoundFixtures].sort((a, b) => {
    const aTime = (a.playedAt ?? a.createdAt).getTime();
    const bTime = (b.playedAt ?? b.createdAt).getTime();
    return aTime - bTime;
  });

  const articles: Array<{
    id: string;
    label: string;
    toneClass: string;
    storyTag: string;
    headline: string;
    body: string;
    context: string;
  }> = [];

  for (let index = 0; index < orderedRoundFixtures.length; index += 1) {
    const fixture = orderedRoundFixtures[index];
    if ((fixture.resultKind ?? "NORMAL") === "DOUBLE_FORFEIT") continue;
    if (articles.length >= 6) break;

    const home = byId.get(fixture.homeParticipantId);
    const away = byId.get(fixture.awayParticipantId);
    const homePosition = positionBefore.get(fixture.homeParticipantId) ?? participants.length;
    const awayPosition = positionBefore.get(fixture.awayParticipantId) ?? participants.length;
    const winnerId = fixture.homeGoals! > fixture.awayGoals! ? fixture.homeParticipantId : fixture.awayParticipantId;
    const winnerName =
      winnerId === fixture.homeParticipantId
        ? getDisplayName(home?.displayName ?? "Home")
        : getDisplayName(away?.displayName ?? "Away");
    const loserName =
      winnerId === fixture.homeParticipantId
        ? getDisplayName(away?.displayName ?? "Away")
        : getDisplayName(home?.displayName ?? "Home");
    const winnerBefore = winnerId === fixture.homeParticipantId ? homePosition : awayPosition;
    const loserBefore = winnerId === fixture.homeParticipantId ? awayPosition : homePosition;

    const cumulativeFixtures = [
      ...fixturesBeforeRound,
      ...orderedRoundFixtures.slice(0, index + 1),
    ];
    const standingsAfter = computeLeagueTable(participants, cumulativeFixtures);
    const winnerPosAfter =
      standingsAfter.findIndex((row) => row.participantId === winnerId) + 1;
    const climb = winnerBefore - winnerPosAfter;

    const score = `${fixture.homeGoals} - ${fixture.awayGoals}${fixture.overtimeWinner ? " (OT)" : ""}`;
    const winnerGoals = winnerId === fixture.homeParticipantId ? fixture.homeGoals ?? 0 : fixture.awayGoals ?? 0;
    const loserGoals = winnerId === fixture.homeParticipantId ? fixture.awayGoals ?? 0 : fixture.homeGoals ?? 0;
    const totalGoals = (fixture.homeGoals ?? 0) + (fixture.awayGoals ?? 0);
    const isUpset = winnerBefore > loserBefore;
    const isWalkover =
      fixture.resultKind === "HOME_WALKOVER" || fixture.resultKind === "AWAY_WALKOVER";

    const variant = pickVariant(leagueStoryTemplates, fixture.id);
    const headline = variant.headline(winnerName, loserName, score);
    const venueName = home?.homeStadium ?? "the arena";
    const sceneHook = pickVariant(leagueSceneHooks, fixture.id)(venueName, winnerName, loserName);
    const momentumHook = pickVariant(leagueMomentumHooks, `${fixture.id}-momentum`)(
      winnerName,
      loserName,
      isUpset,
    );

    const standingsLine =
      climb > 0
        ? `After this result, ${winnerName} is #${winnerPosAfter} in the live table — up ${climb} place${climb === 1 ? "" : "s"} compared with the start of GameWeek ${activeRound}, when they were #${winnerBefore}.`
        : climb < 0
          ? `${winnerName} drops to #${winnerPosAfter} for now (was #${winnerBefore} when the week opened) as other results shuffle the pack around them.`
          : `${winnerName} stays #${winnerPosAfter}, matching their GameWeek ${activeRound} starting rank — the points still change how tight the chase is.`;

    const marginLine =
      fixture.overtimeWinner && !isWalkover
        ? `Overtime decided it: extra-time tension tilts toward ${winnerName} after a tied regulation.`
        : isWalkover
          ? `Ruled as a walkover — one side could not field the series, so the scoreline is awarded rather than played out.`
          : isUpset
            ? `Bracket math flipped: #${winnerBefore} ${winnerName} upset #${loserBefore} ${loserName} on the day.`
            : loserGoals === 0
              ? `${winnerName} never let ${loserName} get on the board — a defensive lock from the first kickoff.`
              : totalGoals >= 6
                ? `${totalGoals} goals in one fixture — end-to-end chaos and barely a breath between chances.`
                : winnerGoals >= 4
                  ? `${winnerName} ran up the scoreline and never gave ${loserName} a foothold to answer.`
                  : `Tight margins, but ${winnerName} found the separating goal when it mattered.`;

    const zinger = isWalkover
      ? `Ruled on the sheet — the standings still move.`
      : totalGoals >= 12
        ? `The replay cam might catch fire before midnight.`
        : isUpset
          ? `Bracket math just got personal — the league chat will remember this one.`
          : winnerGoals >= 6
            ? `${winnerName} put on a clinic; ${loserName} will feel every replay.`
            : `Another GameWeek ${activeRound} story in the books.`;

    const closer = pickVariant(leagueCloserHooks, `${fixture.id}-closer`)(winnerName, activeRound);
    const body = `${sceneHook} ${momentumHook} ${standingsLine} ${marginLine} ${zinger} ${closer}`;
    const context = `Snapshot: ${getDisplayName(home?.displayName ?? "Home")} opened at #${homePosition}, ${getDisplayName(away?.displayName ?? "Away")} at #${awayPosition}. As of this result, ${winnerName} sits #${winnerPosAfter}.`;
    const storyTag = isWalkover
      ? "Walkover"
      : fixture.overtimeWinner
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

    articles.push({
      id: fixture.id,
      label: variant.label,
      toneClass: variant.toneClass,
      storyTag,
      headline,
      body,
      context,
    });
  }

  const completedKnockout = knockoutFixtures.filter(
    (fixture) => fixture.status === "COMPLETED",
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
            const winnerName = winnerIsHome
              ? getDisplayName(home?.displayName ?? "Home")
              : getDisplayName(away?.displayName ?? "Away");
            const loserName = winnerIsHome
              ? getDisplayName(away?.displayName ?? "Away")
              : getDisplayName(home?.displayName ?? "Home");
            const variant = pickVariant(knockoutStoryTemplates, fixture.id);
            const isFinal = fixture.round === knockoutFixtures.length;
            const isWalkover =
              fixture.resultKind === "HOME_WALKOVER" || fixture.resultKind === "AWAY_WALKOVER";
            const storyTag = isFinal
              ? "Final"
              : fixture.overtimeWinner
                ? "Knockout OT"
                : isWalkover
                  ? "Walkover"
                  : "Advancement";
            const roundLabel = `Gauntlet Round ${fixture.round}`;
            const margin = Math.abs((fixture.homeGoals ?? 0) - (fixture.awayGoals ?? 0));
            const stadium = home?.homeStadium ?? "the arena";
            const gauntletEdge = pickVariant(
              [
                "The gauntlet lights are hotter now; every remaining touch carries season weight.",
                "No safe possessions left in this bracket - one bad challenge ends a campaign.",
                "The atmosphere is pure elimination football now: pressure, panic, and precision.",
              ],
              `${fixture.id}-edge`,
            );
            const body = isFinal
              ? `${winnerName} burns through ${roundLabel} at ${stadium} and claims the season${isWalkover ? " — sheet shows a forfeit award" : ` by ${margin} goal${margin === 1 ? "" : "s"}`}. ${loserName} goes out in the last dance — what a run.`
              : `${winnerName} survives ${roundLabel} at ${stadium}${isWalkover ? " (walkover on the sheet)" : ""}; ${loserName}'s gauntlet ends in smoke. Higher seeds are waiting — the bracket just got heavier. ${gauntletEdge}`;
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
              body,
              context: `${getDisplayName(home?.displayName ?? "Home")} vs ${getDisplayName(away?.displayName ?? "Away")} · ${roundLabel}`,
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
    <div className="home-page space-y-8">
      {tournament.id === "preview-tournament" ? (
        <section className="surface-card border-amber-300/60 bg-amber-500/15 p-4">
          <p className="text-sm font-semibold text-amber-100">
            Preview mode: showing demo data because live database is currently unavailable.
          </p>
        </section>
      ) : null}
      <section className="stagger-fade grid gap-4 md:grid-cols-3">
        <div className="surface-card p-5">
          <p className="muted text-xs uppercase tracking-widest">Participants</p>
          <p className="mt-1 text-4xl font-black">{participants.length}</p>
        </div>
        <div className="surface-card p-5">
          <p className="muted text-xs uppercase tracking-widest">League Matches Played</p>
          <p className="mt-1 text-4xl font-black">
            {completedLeague.length} / {leagueFixtures.length}
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="muted text-xs uppercase tracking-widest">Knockout Matches</p>
          <p className="mt-1 text-4xl font-black">
            {fixtures.filter((fixture) => fixture.phase === "KNOCKOUT").length}
          </p>
        </div>
      </section>
      <section className="stagger-fade grid gap-4 md:grid-cols-2">
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
              ? `${formatUkDate(nextDeadlineFixture.dueAt)} — ${getDisplayName(byId.get(nextDeadlineFixture.homeParticipantId)?.displayName ?? "Home")} vs ${getDisplayName(byId.get(nextDeadlineFixture.awayParticipantId)?.displayName ?? "Away")}`
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

      <section className="stagger-fade grid gap-4 md:grid-cols-3">
        <div className="surface-card p-5">
          <p className="muted text-xs uppercase tracking-widest">Title Race Leader</p>
          <p className="mt-2 text-lg font-bold">
            {race.titleRace[0] ? race.titleRace[0].team : "TBD"}
          </p>
          <p className="muted mt-1 text-xs">{race.titleRace[0]?.points ?? 0} pts</p>
        </div>
        <div className="surface-card p-5">
          <p className="muted text-xs uppercase tracking-widest">Best Attack</p>
          <p className="mt-2 text-lg font-bold">{race.bestAttack?.team ?? "TBD"}</p>
          <p className="muted mt-1 text-xs">{race.bestAttack?.goalsFor ?? 0} goals scored</p>
        </div>
        <div className="surface-card p-5">
          <p className="muted text-xs uppercase tracking-widest">Best Defence</p>
          <p className="mt-2 text-lg font-bold">{race.bestDefence?.team ?? "TBD"}</p>
          <p className="muted mt-1 text-xs">{race.bestDefence?.goalsAgainst ?? 0} goals conceded</p>
        </div>
      </section>

      {featuredFixture ? (
        <section className="surface-card p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="muted text-xs uppercase tracking-widest">Fixture Spotlight</p>
            <span className="stat-chip">{featuredFixture.spotlightTag}</span>
          </div>
          <p className="mt-2 text-lg font-bold">
            {getDisplayName(featuredFixture.home?.displayName ?? "Home")} vs {getDisplayName(featuredFixture.away?.displayName ?? "Away")}
          </p>
          <p className="muted mt-1 text-sm">
            GameWeek {featuredFixture.fixture.round} ·{" "}
            {featuredFixture.fixture.dueAt ? formatUkDate(featuredFixture.fixture.dueAt) : "Deadline not set"}
          </p>
        </section>
      ) : null}

      <section className="news-section-enhanced surface-card fade-in-up p-6">
        <h2 className="news-section-title mb-2 text-xl font-semibold">
          {completedKnockout.length > 0 ? "Gauntlet News" : "GameWeek News"}
        </h2>
        <p className="muted mb-4 text-sm leading-relaxed">
          {completedKnockout.length > 0
            ? `Knockout chaos, distilled: every line below is from Gauntlet Round ${latestKnockoutRound} — bracket energy, zero filler.`
            : activeRound
              ? `Wire-to-wire coverage from GameWeek ${activeRound}: form swings, table shocks, and the kind of goals that belong on a highlight reel.`
              : "The notebook is open — as soon as results land, this rail turns into headlines, not bullet points."}
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
                <p className="news-body mt-1 text-sm">{article.body}</p>
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
              <p className="mt-1 text-lg font-semibold">{getDisplayName(runnerUp?.displayName ?? "TBD")}</p>
            </div>
            <div className="podium-first rounded-xl border border-amber-300/60 bg-amber-300/15 p-4 text-center">
              <div className="confetti-burst" />
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-100">Champion</p>
              <p className="mt-1 text-2xl font-black text-amber-100">{getDisplayName(champion.displayName)}</p>
              <p className="mt-2 text-xs text-amber-100/90">Season Winner</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="muted text-xs uppercase tracking-widest">3rd Place</p>
              <p className="mt-1 text-lg font-semibold">{getDisplayName(third?.displayName ?? "TBD")}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="cta-row stagger-fade flex flex-wrap gap-3">
        <Link className="neo-button rounded-xl px-5 py-2.5 font-semibold" href="/fixtures">
          View Fixtures
        </Link>
        <Link className="neo-button rounded-xl px-5 py-2.5 font-semibold" href="/table">
          View League Table
        </Link>
        <Link className="neo-button rounded-xl px-5 py-2.5 font-semibold" href="/bracket">
          View Gauntlet
        </Link>
      </section>
    </div>
  );
}
