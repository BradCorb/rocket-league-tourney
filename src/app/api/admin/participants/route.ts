import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "@/lib/admin";
import { resetParticipants } from "@/lib/data";

const hexColor = z.string().regex(/^#?[0-9a-fA-F]{6}$/);

const schema = z.object({
  participants: z.array(
    z.object({
      displayName: z.string().min(1),
      homeStadium: z.string().min(1),
      primaryColor: hexColor,
      secondaryColor: hexColor,
    }),
  ).min(2),
});

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await resetParticipants(parsed.data.participants);
  return NextResponse.json({ ok: true });
}
