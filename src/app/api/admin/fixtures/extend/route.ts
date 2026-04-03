import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({
  fixtureId: z.string().min(1),
  /** Positive extends the deadline, negative brings it forward (e.g. -1 = one day sooner). */
  deltaDays: z.number().int().min(-30).max(30),
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

  const baseDate = fixture.dueAt ?? new Date();
  const newDueAt = new Date(
    baseDate.getTime() + parsed.data.deltaDays * 24 * 60 * 60 * 1000,
  );

  await prisma.fixture.update({
    where: { id: fixture.id },
    data: { dueAt: newDueAt },
  });

  return NextResponse.json({ ok: true, dueAt: newDueAt.toISOString() });
}
