import { getTournamentDataReadOnly } from "@/lib/data";
import { buildGauntletBracket, computeLeagueTable } from "@/lib/tournament";
import { TeamName } from "@/components/team-name";
import { getDisplayName } from "@/lib/display-name";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  /** Bracket route is read-only: no knockout seeding here so visiting never writes to the DB. */
  const { tournament, participants, fixtures } = await getTournamentDataReadOnly();
  const standings = computeLeagueTable(
    participants,
    fixtures.filter((fixture) => fixture.phase === "LEAGUE"),
  );
  const bracket = buildGauntletBracket(
    standings,
    participants,
    fixtures.filter((fixture) => fixture.phase === "KNOCKOUT"),
  );
  const rounds = bracket.length;
  const currentRound = bracket.find((match) => !match.winner)?.round ?? null;
  const finalMatch = bracket[bracket.length - 1];
  const champion = tournament.status === "COMPLETE" ? finalMatch?.winner : undefined;

  return (
    <div className="gauntlet-page">
      <div className="gauntlet-ember-fog" aria-hidden />
      <div className="gauntlet-sparks" aria-hidden />
      <div className="gauntlet-ember-rise" aria-hidden />
      <div className="gauntlet-lightning-flicker" aria-hidden />
      <div className="gauntlet-vignette" aria-hidden />

      <div className="gauntlet-content relative z-[2] space-y-8">
        <header className="gauntlet-hero">
          <p className="gauntlet-hero-kicker">Endgame · single elimination</p>
          <h2 className="gauntlet-hero-title">
            THE <span className="gauntlet-hero-accent">GAUNTLET</span>
          </h2>
          <p className="gauntlet-hero-sub">
            Last vs second-last, then climb the seeds. Every round is a stadium showdown — lose and
            you&apos;re done.
          </p>
          <div className="gauntlet-intensity mt-4" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="gauntlet-hero-bar" aria-hidden />
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold" href="/match-centre">
              Open Match Centre
            </Link>
            <Link className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold" href="/stats-hub">
              Open Stats Hub
            </Link>
          </div>
        </header>

        {tournament.id === "preview-tournament" ? (
          <section className="surface-card border-amber-300/60 bg-amber-500/15 p-4">
            <p className="text-sm font-semibold text-amber-100">
              Preview mode: bracket uses demo data until the live database reconnects.
            </p>
          </section>
        ) : null}

        {champion ? (
          <section className="gauntlet-champion-card surface-card p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-200/90">
              Champion
            </p>
            <p className="mt-2 font-black tracking-tight text-amber-50" style={{ fontSize: "clamp(1.75rem, 5vw, 2.75rem)" }}>
              {getDisplayName(champion.displayName)}
            </p>
            <p className="mt-1 text-sm text-amber-100/85">Season winner — gauntlet cleared.</p>
          </section>
        ) : null}

        <div className="space-y-6">
          {bracket.map((match, index) => {
            const hasResult =
              match.homeGoals !== null &&
              match.homeGoals !== undefined &&
              match.awayGoals !== null &&
              match.awayGoals !== undefined;
            const homeWon = hasResult && match.winner?.id === match.home?.id;
            const awayWon = hasResult && match.winner?.id === match.away?.id;
            const homeLost = hasResult && match.home?.id && !homeWon;
            const awayLost = hasResult && match.away?.id && !awayWon;
            const isLive = currentRound === match.round;

            return (
              <section
                key={match.round}
                className={`gauntlet-match surface-card p-5 sm:p-6 ${isLive ? "gauntlet-match--live" : "fade-in-up"}`}
                style={{ animationDelay: `${index * 45}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="gauntlet-round-tag">
                      {match.label}{" "}
                      <span className="text-white/50">
                        ({index + 1}/{rounds})
                      </span>
                    </p>
                    <p className="muted mt-1 text-xs">Home venue · {match.home?.homeStadium ?? "TBD"}</p>
                  </div>
                  {isLive ? (
                    <span className="gauntlet-live-badge shrink-0">LIVE</span>
                  ) : hasResult ? (
                    <span className="gauntlet-done-badge shrink-0">SETTLED</span>
                  ) : (
                    <span className="gauntlet-wait-badge shrink-0">WAITING</span>
                  )}
                </div>

                <div className="gauntlet-pair mt-5">
                  <div
                    className={`gauntlet-pilot ${homeWon ? "gauntlet-pilot--win" : ""} ${homeLost ? "gauntlet-pilot--out" : ""} ${!hasResult ? "gauntlet-pilot--idle" : ""}`}
                  >
                    {homeLost ? (
                      <span className="font-semibold text-rose-200/95 line-through decoration-rose-400/80">
                        {getDisplayName(match.home?.displayName ?? "TBD")}
                      </span>
                    ) : (
                      <TeamName
                        name={match.home?.displayName ?? "TBD"}
                        primaryColor={match.home?.primaryColor}
                        secondaryColor={match.home?.secondaryColor}
                      />
                    )}
                  </div>

                  <div className="gauntlet-vs-wrap">
                    <span className="gauntlet-vs">VS</span>
                  </div>

                  <div
                    className={`gauntlet-pilot ${awayWon ? "gauntlet-pilot--win" : ""} ${awayLost ? "gauntlet-pilot--out" : ""} ${!hasResult ? "gauntlet-pilot--idle" : ""}`}
                  >
                    {awayLost ? (
                      <span className="font-semibold text-rose-200/95 line-through decoration-rose-400/80">
                        {getDisplayName(match.away?.displayName ?? "TBD")}
                      </span>
                    ) : (
                      <TeamName
                        name={match.away?.displayName ?? "TBD"}
                        primaryColor={match.away?.primaryColor}
                        secondaryColor={match.away?.secondaryColor}
                      />
                    )}
                  </div>
                </div>

                <div className="gauntlet-scoreboard mt-5 border-t border-white/10 pt-4">
                  <p className="font-mono text-base font-bold tracking-wide text-cyan-50 sm:text-lg">
                    {hasResult
                      ? `${match.homeGoals} — ${match.awayGoals}${match.overtimeWinner ? " · OT" : ""}`
                      : "— · · · · · · · · · · —"}
                  </p>
                  <p className="mt-2 text-sm text-cyan-100/90">
                    <span className="text-white/45">Winner</span>{" "}
                    {match.winner ? (
                      <TeamName
                        name={match.winner.displayName}
                        primaryColor={match.winner.primaryColor}
                        secondaryColor={match.winner.secondaryColor}
                      />
                    ) : (
                      <span className="font-semibold text-amber-200/90">TBD</span>
                    )}
                  </p>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
