const BASE_URL = "https://rocket-league-tourney.vercel.app";

const participants = [
  ["Brad", "DFH Stadium", "#00E5FF", "#7A5CFF"],
  ["Akazz", "Mannfield", "#7A5CFF", "#FF4FD8"],
  ["Jacob", "Champions Field", "#FF4FD8", "#00E5FF"],
  ["JJ", "Neo Tokyo", "#20F6A9", "#3454FF"],
  ["DDM", "Utopia Coliseum", "#FFB347", "#6C5CE7"],
  ["Yuli", "Forbidden Temple", "#FF6B6B", "#4ECDC4"],
  ["Olly", "Urban Central", "#FFD93D", "#845EC2"],
  ["Jordan", "Wasteland", "#F9844A", "#43AA8B"],
  ["Player 9", "Farmstead", "#90BE6D", "#577590"],
  ["Player 10", "Aquadome", "#00BBF9", "#F15BB5"],
].map(([displayName, homeStadium, primaryColor, secondaryColor]) => ({
  displayName,
  homeStadium,
  primaryColor,
  secondaryColor,
}));

async function request(path, init = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${JSON.stringify(data)}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("1) Resetting participants...");
  await request("/api/admin/participants", {
    method: "POST",
    body: JSON.stringify({ participants }),
  });

  console.log("2) Generating league fixtures...");
  await request("/api/admin/fixtures/generate", { method: "POST" });

  console.log("3) Fetching fixtures...");
  let fixtures = await request("/api/fixtures");
  let league = fixtures.filter((f) => f.phase === "LEAGUE");
  assert(league.length === 90, `Expected 90 league fixtures, got ${league.length}`);
  const rounds = [...new Set(league.map((f) => f.round))].sort((a, b) => a - b);
  assert(rounds.length === 18, `Expected 18 league rounds, got ${rounds.length}`);

  console.log("4) Playing full league season...");
  for (const round of rounds) {
    const roundMatches = league.filter((f) => f.round === round);
    for (let i = 0; i < roundMatches.length; i += 1) {
      const fixture = roundMatches[i];
      const homeGoals = 2 + ((round + i) % 3);
      const awayGoals = 1 + ((round + i + 1) % 2);
      const safeHomeGoals = homeGoals === awayGoals ? homeGoals + 1 : homeGoals;
      const wentToOvertime = (round + i) % 4 === 0;
      await request("/api/admin/results", {
        method: "POST",
        body: JSON.stringify({
          fixtureId: fixture.id,
          homeGoals: safeHomeGoals,
          awayGoals,
          wentToOvertime,
        }),
      });
    }
  }

  console.log("5) Validating league table...");
  const table = await request("/api/table");
  assert(table.length === 10, `Expected 10 teams in table, got ${table.length}`);
  const invalidPlayed = table.filter((row) => row.played !== 18);
  assert(invalidPlayed.length === 0, `Expected all teams played=18, got invalid rows: ${JSON.stringify(invalidPlayed)}`);

  console.log("6) Validating knockout bracket generation...");
  let bracket = await request("/api/bracket");
  assert(bracket.length === 9, `Expected 9 knockout rounds, got ${bracket.length}`);

  console.log("7) Playing full gauntlet...");
  for (let round = 1; round <= 9; round += 1) {
    fixtures = await request("/api/fixtures");
    const current = fixtures
      .filter((f) => f.phase === "KNOCKOUT" && f.round === round)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    assert(Boolean(current), `Missing knockout fixture for round ${round}`);
    await request("/api/admin/results", {
      method: "POST",
      body: JSON.stringify({
        fixtureId: current.id,
        homeGoals: 3,
        awayGoals: 1,
        wentToOvertime: round % 3 === 0,
      }),
    });
  }

  console.log("8) Verifying knockout completion and winner...");
  bracket = await request("/api/bracket");
  const final = bracket[bracket.length - 1];
  assert(Boolean(final?.winner?.displayName), "Final winner missing after knockout completion");

  console.log("9) Checking public pages for news/podium/fixtures...");
  const homeHtml = await fetch(`${BASE_URL}/`).then((r) => r.text());
  assert(homeHtml.includes("Gauntlet News"), "Homepage missing Gauntlet News");
  assert(homeHtml.includes("Final Podium"), "Homepage missing Final Podium");
  assert(homeHtml.includes("Champion"), "Homepage missing Champion section");

  const fixturesHtml = await fetch(`${BASE_URL}/fixtures`).then((r) => r.text());
  assert(fixturesHtml.includes("GameWeek 1"), "Fixtures page missing GameWeek 1");
  assert(fixturesHtml.includes("Knockout"), "Fixtures page missing Knockout section");

  const bracketHtml = await fetch(`${BASE_URL}/bracket`).then((r) => r.text());
  assert(bracketHtml.includes("Tournament Champion"), "Bracket page missing champion banner");

  console.log("SUCCESS: Full season simulation completed and core checks passed.");
  console.log(`Champion: ${final.winner.displayName}`);
}

main().catch((error) => {
  console.error("FAILED:", error.message);
  process.exitCode = 1;
});
