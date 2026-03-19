export default function RulesPage() {
  return (
    <div className="space-y-6">
      <h2 className="page-title text-2xl font-black">Tournament Rules</h2>

      <section className="surface-card p-5">
        <h3 className="text-lg font-semibold">Format</h3>
        <ul className="muted mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>League phase is double round-robin: everyone plays home and away.</li>
          <li>League fixtures are shown by GameWeek and unlock week-by-week.</li>
          <li>Knockout gauntlet: 3rd vs 4th, winner vs 2nd, winner vs 1st.</li>
        </ul>
      </section>

      <section className="surface-card p-5">
        <h3 className="text-lg font-semibold">Points System</h3>
        <ul className="muted mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Regular-time win: 3 points to winner, 0 to loser.</li>
          <li>Regular-time draw: 1 point each.</li>
          <li>
            If the draw goes to overtime in league play, overtime winner gets +1 bonus point
            (so overtime winner gets 2, loser gets 1).
          </li>
          <li>Knockout draws are decided by overtime winner (no ties in knockout).</li>
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
    </div>
  );
}
