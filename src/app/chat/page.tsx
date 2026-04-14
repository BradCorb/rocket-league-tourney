import { ChatRoom } from "@/components/chat-room";
import { getSession } from "@/lib/auth-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/chat");
  return (
    <div className="space-y-6">
      <h2 className="page-title text-2xl font-black">Participant Chat</h2>
      <p className="muted text-sm">
        Logged-in chat only. Messages show your participant name with team colors.
      </p>
      <ChatRoom currentUser={session.displayName} />
    </div>
  );
}
