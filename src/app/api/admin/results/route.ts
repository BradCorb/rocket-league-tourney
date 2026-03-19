import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/admin";
import { ensureKnockoutFixtures, updateKnockoutProgression } from "@/lib/data";
import { z } from "zod";

const schema = z.object({
  fixtureId: z.string().min(1),
  homeGoals: z.number().int().min(0),
  awayGoals: z.number().int().min(0),
  overtimeWinner: z.enum(["HOME", "AWAY"]).nullable().optional(),
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
    fixture.phase === "KNOCKOUT" &&
    parsed.data.homeGoals === parsed.data.awayGoals &&
    !parsed.data.overtimeWinner
  ) {
    return NextResponse.json(
      { error: "Knockout draws must include an overtime winner." },
      { status: 400 },
    );
  }
  if (
    parsed.data.homeGoals !== parsed.data.awayGoals &&
    parsed.data.overtimeWinner
  ) {
    return NextResponse.json(
      { error: "Overtime winner can only be set when scores are level." },
      { status: 400 },
    );
  }

  const updated = await prisma.fixture.update({
    where: { id: parsed.data.fixtureId },
    data: {
      homeGoals: parsed.data.homeGoals,
      awayGoals: parsed.data.awayGoals,
      overtimeWinner:
        parsed.data.homeGoals === parsed.data.awayGoals
          ? parsed.data.overtimeWinner ?? null
          : null,
      status: "COMPLETED",
      playedAt: new Date(),
    },
  });

  await updateKnockoutProgression(updated);
  await ensureKnockoutFixtures();

  return NextResponse.json({ ok: true });
}
