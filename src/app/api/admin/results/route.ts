import { NextResponse } from "next/server";
import { FixturePhase, FixtureStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/admin";
import { ensureKnockoutFixtures, updateKnockoutProgression } from "@/lib/data";
import { z } from "zod";

const schema = z.object({
  fixtureId: z.string().min(1),
  homeGoals: z.number().int().min(0),
  awayGoals: z.number().int().min(0),
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
  if (
    fixture.phase === FixturePhase.KNOCKOUT &&
    parsed.data.homeGoals === parsed.data.awayGoals
  ) {
    return NextResponse.json(
      { error: "Knockout matches cannot end in a draw." },
      { status: 400 },
    );
  }

  const updated = await prisma.fixture.update({
    where: { id: parsed.data.fixtureId },
    data: {
      homeGoals: parsed.data.homeGoals,
      awayGoals: parsed.data.awayGoals,
      status: FixtureStatus.COMPLETED,
      playedAt: new Date(),
    },
  });

  if (updated.homeGoals !== updated.awayGoals) {
    await updateKnockoutProgression(updated);
  }
  await ensureKnockoutFixtures();

  return NextResponse.json({ ok: true });
}
