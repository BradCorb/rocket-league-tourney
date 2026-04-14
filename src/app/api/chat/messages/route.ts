import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-session";
import { getChatMessages, getPresenceList, insertChatMessage, touchPresence } from "@/lib/chat";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await touchPresence(session.displayName);
  const messages = await getChatMessages();
  const presence = await getPresenceList();
  return NextResponse.json({ messages, presence });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await touchPresence(session.displayName);
  const body = (await request.json().catch(() => ({}))) as { message?: string };
  const result = await insertChatMessage(session.displayName, body.message ?? "");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const messages = await getChatMessages();
  const presence = await getPresenceList();
  return NextResponse.json({ ok: true, messages, presence });
}
