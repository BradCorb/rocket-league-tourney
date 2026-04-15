import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

type VoidBetBody = {
  betId?: string;
};

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as VoidBetBody;
  const betId = String(body.betId ?? "").trim();
  if (!betId) {
    return NextResponse.json({ error: "betId is required." }, { status: 400 });
  }

  let parsedId: bigint;
  try {
    parsedId = BigInt(betId);
  } catch {
    return NextResponse.json({ error: "Invalid betId." }, { status: 400 });
  }

  const prisma = getPrisma();

  // Void only open slips; treat as refunded push (stake returned).
  const voided = await prisma.$queryRaw<Array<{ participant_name: string; stake: number }>>`
    UPDATE gambling_bets
    SET status = ${"WON"},
        return_points = stake,
        settled_at = NOW()
    WHERE id = ${parsedId}
      AND status = 'OPEN'
    RETURNING participant_name, stake
  `;

  if (voided.length === 0) {
    return NextResponse.json(
      { error: "Bet not found or already settled." },
      { status: 404 },
    );
  }

  const row = voided[0];
  await prisma.$executeRaw`
    UPDATE gambling_accounts
    SET balance = balance + ${row.stake},
        updated_at = NOW()
    WHERE participant_name = ${row.participant_name}
  `;

  return NextResponse.json({
    ok: true,
    betId,
    displayName: row.participant_name,
    refundedStake: row.stake,
  });
}

