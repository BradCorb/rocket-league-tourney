import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({
  displayName: z.string().min(1),
  delta: z.number().int().min(-100000).max(100000),
  reason: z.string().trim().max(200).optional(),
});

async function ensureAccountsTable() {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS gambling_accounts (
      participant_name TEXT PRIMARY KEY,
      balance INT NOT NULL,
      reward_start_round INT NOT NULL,
      last_rewarded_round INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  await ensureAccountsTable();
  const prisma = getPrisma();
  const { displayName, delta } = parsed.data;
  const updatedRows = await prisma.$queryRaw<Array<{ balance: number }>>`
    UPDATE gambling_accounts
    SET balance = GREATEST(0, balance + ${delta}),
        updated_at = NOW()
    WHERE participant_name = ${displayName}
    RETURNING balance
  `;
  if (updatedRows.length === 0) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    displayName,
    delta,
    balance: updatedRows[0].balance,
    reason: parsed.data.reason ?? null,
  });
}
