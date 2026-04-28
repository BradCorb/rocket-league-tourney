import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import {
  ensureKnockoutFixtures,
  syncLeagueDeadlinesFromRoundCompletion,
  updateKnockoutProgression,
} from "@/lib/data";
import { reconcileGamblingAfterFixtureUpdate } from "@/lib/gambling";

const schema = z.object({
  fixtureId: z.string().min(1),
  kind: z.enum(["DOUBLE_FORFEIT", "HOME_WALKOVER", "AWAY_WALKOVER"]),
});

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const prisma = getPrisma();
  const fixture = await prisma.fixture.findUnique({
    where: { id: parsed.data.fixtureId },
  });
  if (!fixture) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }

  if (parsed.data.kind === "DOUBLE_FORFEIT" && fixture.phase === "KNOCKOUT") {
    return NextResponse.json(
      { error: "Double forfeit is only available for league fixtures." },
      { status: 400 },
    );
  }

  const data =
    parsed.data.kind === "DOUBLE_FORFEIT"
      ? {
          homeGoals: 0,
          awayGoals: 0,
          overtimeWinner: null,
          resultKind: "DOUBLE_FORFEIT" as const,
        }
      : parsed.data.kind === "HOME_WALKOVER"
        ? {
            homeGoals: 25,
            awayGoals: 0,
            overtimeWinner: null,
            resultKind: "HOME_WALKOVER" as const,
          }
        : {
            homeGoals: 0,
            awayGoals: 25,
            overtimeWinner: null,
            resultKind: "AWAY_WALKOVER" as const,
          };

  const updated = await prisma.fixture.update({
    where: { id: fixture.id },
    data: {
      ...data,
      status: "COMPLETED",
      playedAt: new Date(),
    },
  });

  await syncLeagueDeadlinesFromRoundCompletion(updated);
  await updateKnockoutProgression(updated);
  await ensureKnockoutFixtures();
  await reconcileGamblingAfterFixtureUpdate();

  return NextResponse.json({ ok: true });
}
