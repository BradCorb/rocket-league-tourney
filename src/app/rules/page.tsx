import { getSession } from "@/lib/auth-session";

export default async function RulesPage() {
  const session = await getSession();
  const isLoggedIn = Boolean(session);

  return (
    <div className="rules-page space-y-6">
      <h2 className="page-title text-2xl font-black">Tournament Rules</h2>

      <section className="surface-card p-5">
        <h3 className="text-lg font-semibold">Format</h3>
        <ul className="muted mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Supported participant size is 2 to 20 players.</li>
          <li>League phase is double round-robin: everyone plays home and away.</li>
          <li>For odd participant counts, one player has a bye each GameWeek; bye players are shown on fixtures.</li>
          <li>League fixtures are shown by GameWeek and unlock week-by-week.</li>
          <li>Knockout gauntlet includes every team based on league finish.</li>
          <li>First knockout is last vs second-last (at second-last&apos;s home).</li>
          <li>Each next round winner plays the next higher seed at that seed&apos;s home until the final vs 1st.</li>
          <li>
            Initial league deadlines are set when fixtures are first generated; Brad adjusts any date
            per fixture from the owner admin area (no automatic bulk deadline changes when scores are
            saved).
          </li>
          <li>Each fixture has a deadline date shown on the fixtures page.</li>
        </ul>
      </section>

      <section className="surface-card p-5">
        <h3 className="text-lg font-semibold">Points System</h3>
        <ul className="muted mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Regular-time win: 3 points to winner, 0 to loser.</li>
          <li>If a match is marked as overtime, winner gets 2 points and loser gets 1.</li>
          <li>
            League score entry expects a winning scoreline (no tied final scores).
          </li>
          <li>Knockout score entry also uses a winning scoreline (no ties in knockout).</li>
        </ul>
      </section>

      <section className="surface-card p-5">
        <h3 className="text-lg font-semibold">League Ranking Order</h3>
        <ol className="muted mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Points</li>
          <li>Goal Difference</li>
          <li>Goals For</li>
          <li>Head-to-Head</li>
        </ol>
      </section>

      <section className="surface-card p-5">
        <h3 className="text-lg font-semibold">Scheduling & Reporting</h3>
        <ul className="muted mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>All fixtures are treated as televised games.</li>
          <li>
            Both players in the matchup are responsible for advertising the fixture in the WhatsApp
            group before kickoff.
          </li>
          <li>After a match is completed, players must send the result to Brad.</li>
          <li>Fixtures should be completed within one week of release.</li>
          <li>
            Valid exceptions are allowed (for example holiday or unavoidable conflict) if approved
            by Brad.
          </li>
          <li>
            Brad can move any fixture deadline earlier or later (by days) from the owner admin area.
          </li>
        </ul>
      </section>

      <section className="surface-card p-5">
        <h3 className="text-lg font-semibold">Forfeits (Owner)</h3>
        <ul className="muted mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>
            Double forfeit (league): neither side completes the series in time — recorded as 0–0,
            zero points each, both take a loss with 20 goals conceded for standings.
          </li>
          <li>
            Walkover: one side cannot play — 25–0 to the side that could play; the forfeiting side
            shows as <span className="font-mono text-neutral-200">F</span> in form views.
          </li>
        </ul>
      </section>

      <section className="surface-card p-5">
        <h3 className="text-lg font-semibold">How To Set Up A Match</h3>
        <ul className="muted mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Start Rocket League.</li>
          <li>Press Play.</li>
          <li>Press Private Match.</li>
          <li>Create Private Match.</li>
          <li>Game mode: Soccar.</li>
          <li>Arena: (Home Stadium).</li>
          <li>Team Size: 1v1.</li>
          <li>Bot Difficulty: No Bots.</li>
          <li>Region: Europe.</li>
          <li>Joinable by: Party Only (Make sure you invite your opponent before setting the game up).</li>
          <li>Match Admin: Enabled.</li>
          <li>Team Settings: Team 1 name (blank), Primary and Accent Colour (Home Team Colours).</li>
          <li>For Team 2, ask what colours their kit is and assign that.</li>
          <li>Mutator Settings should all be sorted as default.</li>
        </ul>
      </section>

      {isLoggedIn ? (
        <>
          <section className="surface-card p-5">
            <h3 className="text-lg font-semibold">Super 4 Rules (Members)</h3>
            <ul className="muted mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>Super 4 is available to logged-in members only.</li>
              <li>Predictions are for the current fixture week only.</li>
              <li>Exact score = 5 points, correct result only = 2 points, otherwise 0.</li>
              <li>Once the first match of that week is recorded, Super 4 picks lock for that week.</li>
              <li>
                Other players&apos; picks become visible after the first match result of that week is
                saved.
              </li>
            </ul>
          </section>

          <section className="surface-card p-5">
            <h3 className="text-lg font-semibold">Gambling Rules (Members)</h3>
            <ul className="muted mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>Gambling uses points only (no real money).</li>
              <li>Every account starts with 100 points.</li>
              <li>After each completed GameWeek, every account receives +10 points.</li>
              <li>Only stake points currently in your balance.</li>
              <li>BTTS markets are disabled; betting is currently match result and over/under goals markets only.</li>
              <li>Bets on a fixture close when that fixture is complete (or marked live/locked).</li>
              <li>
                Anti-cheat: bets placed within 6 minutes of a score refresh are voided as losses (stake
                lost).
              </li>
              <li>
                Multi-leg slips lose immediately if any single selection loses; all legs must win for a
                full payout.
              </li>
              <li>
                Draw + OT logic: choose Draw first, then add one OT winner add-on for the same fixture.
              </li>
              <li>Cash-out offers are always capped below the full potential return.</li>
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
