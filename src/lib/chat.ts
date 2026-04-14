import { getPrisma } from "@/lib/prisma";
import { getTournamentDataReadOnly } from "@/lib/data";

type ChatRow = {
  id: string;
  participant_name: string;
  message: string;
  created_at: Date;
};

export type ChatMessage = {
  id: string;
  displayName: string;
  message: string;
  createdAt: string;
  primaryColor?: string;
  secondaryColor?: string;
};

const MAX_MESSAGE_LENGTH = 280;

export function sanitizeChatMessage(input: string) {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return "";
  return trimmed.slice(0, MAX_MESSAGE_LENGTH);
}

async function ensureChatTable() {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      participant_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function getChatMessages(limit = 120): Promise<ChatMessage[]> {
  await ensureChatTable();
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<ChatRow[]>`
    SELECT id::text AS id, participant_name, message, created_at
    FROM chat_messages
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  const ordered = [...rows].reverse();
  const { participants } = await getTournamentDataReadOnly();
  const byName = new Map(participants.map((participant) => [participant.displayName.toLowerCase(), participant]));
  return ordered.map((row) => {
    const participant = byName.get(row.participant_name.toLowerCase());
    return {
      id: row.id,
      displayName: row.participant_name,
      message: row.message,
      createdAt: row.created_at.toISOString(),
      primaryColor: participant?.primaryColor,
      secondaryColor: participant?.secondaryColor,
    };
  });
}

export async function insertChatMessage(displayName: string, rawMessage: string) {
  const message = sanitizeChatMessage(rawMessage);
  if (!message) {
    return { ok: false as const, error: "Message cannot be empty." };
  }
  await ensureChatTable();
  const prisma = getPrisma();
  await prisma.$executeRaw`
    INSERT INTO chat_messages (participant_name, message)
    VALUES (${displayName}, ${message})
  `;
  return { ok: true as const };
}
