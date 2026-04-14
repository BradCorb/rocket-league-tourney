"use client";

import { useEffect, useMemo, useState } from "react";

type TableRowLite = {
  team: string;
  points: number;
};

type FixtureLite = {
  round: number;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
};

function getCurrentRound(fixtures: FixtureLite[]) {
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))].sort((a, b) => a - b);
  return (
    rounds.find((round) =>
      fixtures
        .filter((fixture) => fixture.round === round)
        .some((fixture) => fixture.homeGoals === null || fixture.awayGoals === null),
    ) ?? rounds[rounds.length - 1] ?? null
  );
}

export function LiveSeasonFeed() {
  const [items, setItems] = useState<string[]>([
    "Live season feed active",
  ]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [tableRes, fixturesRes] = await Promise.all([
          fetch("/api/table", { cache: "no-store" }),
          fetch("/api/fixtures", { cache: "no-store" }),
        ]);
        if (!tableRes.ok || !fixturesRes.ok) return;

        const table = (await tableRes.json()) as TableRowLite[];
        const fixtures = (await fixturesRes.json()) as FixtureLite[];
        if (!mounted) return;

        const currentRound = getCurrentRound(fixtures);
        const currentRoundFixtures = currentRound
          ? fixtures.filter((fixture) => fixture.round === currentRound)
          : [];
        const latestResult = currentRoundFixtures.find(
          (fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null,
        );

        const feedItems = [
          currentRound
            ? `GameWeek ${currentRound} live updates`
            : "Season feed active",
          table[0]
            ? `League leader: ${table[0].team} (${table[0].points} pts)`
            : "League leader pending",
          table.length > 0
            ? `Bottom of table: ${table[table.length - 1].team}`
            : "Bottom of table pending",
          latestResult
            ? `Latest final: ${latestResult.home} ${latestResult.homeGoals}-${latestResult.awayGoals} ${latestResult.away}`
            : "No final result yet in current GameWeek",
        ];
        setItems(feedItems);
        setIndex((prev) => prev % feedItems.length);
      } catch {
        // keep existing fallback message
      }
    };

    void load();
    const refresh = window.setInterval(load, 30000);
    return () => {
      mounted = false;
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % Math.max(items.length, 1));
    }, 4500);
    return () => window.clearInterval(tick);
  }, [items.length]);

  const current = useMemo(() => items[index] ?? items[0], [index, items]);
  return <p className="scorebug__line">{current}</p>;
}
