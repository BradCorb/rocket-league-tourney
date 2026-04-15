import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/admin";
import {
  ensureKnockoutFixtures,
  syncLeagueDeadlinesFromRoundCompletion,
  updateKnockoutProgression,
} from "@/lib/data";
import { reconcileGamblingAfterFixtureUpdate } from "@/lib/gambling";
import { z } from "zod";

const schema = z.object({
  fixtureId: z.string().min(1),
  homeGoals: z.number().int().min(0),
  awayGoals: z.number().int().min(0),
  wentToOvertime: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: parsed.data.fixtureId },
  });
  if (!fixture) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }
  if (parsed.data.homeGoals === parsed.data.awayGoals) {
    return NextResponse.json(
      { error: "Draw scores are not allowed. Enter the final winning score." },
      { status: 400 },
    );
  }

  const overtimeWinner = parsed.data.wentToOvertime
    ? parsed.data.homeGoals > parsed.data.awayGoals
      ? "HOME"
      : "AWAY"
    : null;

  const updated = await prisma.fixture.update({
    where: { id: parsed.data.fixtureId },
    data: {
      homeGoals: parsed.data.homeGoals,
      awayGoals: parsed.data.awayGoals,
      overtimeWinner,
      resultKind: "NORMAL",
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
