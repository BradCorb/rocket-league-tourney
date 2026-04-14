"use client";

import { useEffect, useMemo, useState } from "react";
import { TeamName } from "@/components/team-name";

type ChatMessage = {
  id: string;
  displayName: string;
  message: string;
  createdAt: string;
  primaryColor?: string;
  secondaryColor?: string;
};

type PresenceEntry = {
  displayName: string;
  online: boolean;
  primaryColor?: string;
  secondaryColor?: string;
};

export function ChatRoom({ currentUser }: { currentUser: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");

  async function loadMessages() {
    const response = await fetch("/api/chat/messages", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { messages: ChatMessage[]; presence: PresenceEntry[] };
    setMessages(payload.messages);
    setPresence(payload.presence);
  }

  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await fetch("/api/chat/messages", { cache: "no-store" });
      if (!response.ok || !active) return;
      const payload = (await response.json()) as { messages: ChatMessage[]; presence: PresenceEntry[] };
      if (!active) return;
      setMessages(payload.messages);
      setPresence(payload.presence);
    };
    void load();
    const interval = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    setStatus("Sending...");
    const response = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: draft }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(payload.error ?? "Failed to send.");
      return;
    }
    setDraft("");
    setStatus("Sent.");
    await loadMessages();
  }

  const sorted = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages],
  );

  return (
    <div className="space-y-4">
      <section className="surface-card p-4">
        <p className="muted text-xs uppercase tracking-widest">Logged in as</p>
        <p className="mt-1 text-sm font-semibold">{currentUser}</p>
      </section>
      <section className="surface-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Members</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {presence.map((entry) => (
            <div key={entry.displayName} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
              <p className="font-semibold">
                <TeamName
                  name={entry.displayName}
                  primaryColor={entry.primaryColor}
                  secondaryColor={entry.secondaryColor}
                />
              </p>
              <p className={`mt-1 text-xs font-semibold ${entry.online ? "text-emerald-300" : "text-slate-300"}`}>
                {entry.online ? "Online" : "Offline"}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="surface-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest">Chatroom</h3>
        <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {sorted.length === 0 ? (
            <p className="muted text-sm">No messages yet.</p>
          ) : (
            sorted.map((message) => (
              <article key={message.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                <p className="font-semibold">
                  <TeamName
                    name={message.displayName}
                    primaryColor={message.primaryColor}
                    secondaryColor={message.secondaryColor}
                  />
                </p>
                <p className="mt-1">{message.message}</p>
                <p className="muted mt-1 text-[11px]">
                  {new Date(message.createdAt).toLocaleString("en-GB")}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
      <form onSubmit={sendMessage} className="surface-card space-y-3 p-4">
        <label className="muted text-xs uppercase tracking-widest">Send message</label>
        <textarea
          className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm"
          rows={3}
          maxLength={280}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type your message..."
        />
        <div className="flex items-center justify-between gap-2">
          <p className="muted text-xs">{draft.trim().length}/280</p>
          <button type="submit" className="neo-button rounded-lg px-4 py-2 text-sm font-semibold">
            Send
          </button>
        </div>
        {status ? <p className="muted text-xs">{status}</p> : null}
      </form>
    </div>
  );
}
