export default function RulesPage() {
  return (
    <div className="space-y-6">
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
          <li>After a match is completed, players must send the result to Brad.</li>
          <li>Fixtures should be completed within one week of release.</li>
          <li>
            Valid exceptions are allowed (for example holiday or unavoidable conflict) if approved
            by Brad.
          </li>
          <li>Brad can extend individual fixture deadlines in the owner admin area.</li>
        </ul>
      </section>
    </div>
  );
}
