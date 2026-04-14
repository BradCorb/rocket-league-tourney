import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-session";
import { getChatMessages, insertChatMessage } from "@/lib/chat";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const messages = await getChatMessages();
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { message?: string };
  const result = await insertChatMessage(session.displayName, body.message ?? "");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const messages = await getChatMessages();
  return NextResponse.json({ ok: true, messages });
}
