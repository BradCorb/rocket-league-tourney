type ScoreFixture = {
  homeGoals: number | null;
  awayGoals: number | null;
  resultKind?: "NORMAL" | "DOUBLE_FORFEIT" | "HOME_WALKOVER" | "AWAY_WALKOVER" | null;
};

export function isFixtureScored(fixture: ScoreFixture) {
  return fixture.homeGoals !== null && fixture.awayGoals !== null;
}

export function isFixtureLive(fixture: ScoreFixture) {
  if (!isFixtureScored(fixture)) return false;
  if (fixture.resultKind === "DOUBLE_FORFEIT") return false;
  return (fixture.homeGoals ?? 0) + (fixture.awayGoals ?? 0) > 0;
}

export function fixtureStatusLabel(fixture: ScoreFixture): "PENDING" | "LIVE" | "PLAYED" {
  if (!isFixtureScored(fixture)) return "PENDING";
  return isFixtureLive(fixture) ? "LIVE" : "PLAYED";
}
