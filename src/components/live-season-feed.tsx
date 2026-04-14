"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type TableRowLite = {
  team: string;
  points: number;
};

type FixtureLite = {
  phase: string;
  round: number;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  playedAt: string | null;
};

function pageHeadline(pathname: string) {
  if (pathname === "/" || pathname === "") return "Home desk";
  if (pathname.startsWith("/fixtures")) return "Fixtures desk";
  if (pathname.startsWith("/match-centre")) return "Match Centre desk";
  if (pathname.startsWith("/table")) return "League table desk";
  if (pathname.startsWith("/stats-hub")) return "Stats Hub desk";
  if (pathname.startsWith("/profiles")) return "Profiles desk";
  if (pathname.startsWith("/bracket")) return "Gauntlet desk";
  if (pathname.startsWith("/rules")) return "Rules desk";
  if (pathname.startsWith("/supercomputer")) return "Supercomputer desk";
  return "Season desk";
}

function getLeagueFixtures(fixtures: FixtureLite[]) {
  return fixtures.filter((fixture) => fixture.phase === "LEAGUE");
}

function getCurrentRound(fixtures: FixtureLite[]) {
  const league = getLeagueFixtures(fixtures);
  const rounds = [...new Set(league.map((fixture) => fixture.round))].sort((a, b) => a - b);
  return (
    rounds.find((round) =>
      league
        .filter((fixture) => fixture.round === round)
        .some((fixture) => fixture.homeGoals === null || fixture.awayGoals === null),
    ) ?? rounds[rounds.length - 1] ?? null
  );
}

function getLatestCompletedLeagueFixture(fixtures: FixtureLite[]) {
  const completed = getLeagueFixtures(fixtures).filter(
    (fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null,
  );
  if (completed.length === 0) return null;
  return [...completed].sort((a, b) => {
    const ta = a.playedAt ? new Date(a.playedAt).getTime() : 0;
    const tb = b.playedAt ? new Date(b.playedAt).getTime() : 0;
    return tb - ta;
  })[0];
}

export function LiveSeasonFeed() {
  const pathname = usePathname();
  const [segments, setSegments] = useState<string[]>(["Live season feed — loading…"]);
  const headline = useMemo(() => pageHeadline(pathname), [pathname]);

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

        const leagueFixtures = getLeagueFixtures(fixtures);
        const currentRound = getCurrentRound(leagueFixtures);
        const currentRoundFixtures = currentRound
          ? leagueFixtures.filter((fixture) => fixture.round === currentRound)
          : [];
        const latestResult = getLatestCompletedLeagueFixture(leagueFixtures);
        const pendingThisGw = currentRoundFixtures.filter(
          (fixture) => fixture.homeGoals === null || fixture.awayGoals === null,
        ).length;

        const nextSegments = [
          headline,
          currentRound
            ? `GameWeek ${currentRound} — live wire`
            : "Season feed active",
          table[0]
            ? `League leader: ${table[0].team} (${table[0].points} pts)`
            : "League leader pending",
          table.length > 0
            ? `Foot of the table: ${table[table.length - 1].team}`
            : "Foot of the table pending",
          latestResult
            ? `Latest final: ${latestResult.home} ${latestResult.homeGoals}-${latestResult.awayGoals} ${latestResult.away}`
            : "Awaiting next final whistle",
          pendingThisGw > 0
            ? `${pendingThisGw} fixture${pendingThisGw === 1 ? "" : "s"} still live this GameWeek`
            : "Current GameWeek complete — watch the next drop",
        ];
        setSegments(nextSegments);
      } catch {
        if (mounted) {
          setSegments([headline, "Live season feed — reconnecting…"]);
        }
      }
    };

    void load();
    const refresh = window.setInterval(load, 30000);
    return () => {
      mounted = false;
      window.clearInterval(refresh);
    };
  }, [headline]);

  const durationSec = Math.max(32, segments.length * 8);
  const marqueeKey = segments.join("‖").slice(0, 200);

  const half = (
    <span className="scorebug-marquee__half">
      {segments.map((text, index) => (
        <span key={index} className="scorebug-marquee__segment">
          <span className="scorebug-marquee__dot" aria-hidden>
            ●
          </span>
          {text}
        </span>
      ))}
    </span>
  );

  return (
    <div className="scorebug-track" role="status" aria-live="polite">
      <div
        key={marqueeKey}
        className="scorebug-marquee"
        style={{ animationDuration: `${durationSec}s` }}
      >
        {half}
        <span className="scorebug-marquee__half" aria-hidden="true">
          {segments.map((text, index) => (
            <span key={`dup-${index}`} className="scorebug-marquee__segment">
              <span className="scorebug-marquee__dot" aria-hidden>
                ●
              </span>
              {text}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
