import { getPrisma } from "@/lib/prisma";
import { getTournamentDataReadOnly } from "@/lib/data";
import { getParticipantLoginNames } from "@/lib/participant-auth";

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

export type ChatPresence = {
  displayName: string;
  online: boolean;
  primaryColor?: string;
  secondaryColor?: string;
};

const MAX_MESSAGE_LENGTH = 2000;

export function sanitizeChatMessage(input: string) {
  const trimmed = input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
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
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS chat_presence (
      participant_name TEXT PRIMARY KEY,
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

export async function touchPresence(displayName: string) {
  await ensureChatTable();
  const prisma = getPrisma();
  await prisma.$executeRaw`
    INSERT INTO chat_presence (participant_name, last_seen)
    VALUES (${displayName}, NOW())
    ON CONFLICT (participant_name)
    DO UPDATE SET last_seen = NOW()
  `;
}

export async function getPresenceList(): Promise<ChatPresence[]> {
  await ensureChatTable();
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ participant_name: string; online: boolean }>>`
    SELECT
      p.participant_name,
      (p.last_seen >= NOW() - INTERVAL '60 seconds') AS online
    FROM chat_presence p
  `;
  const byStatus = new Map(rows.map((row) => [row.participant_name.toLowerCase(), row.online]));
  const { participants } = await getTournamentDataReadOnly();
  const byParticipant = new Map(participants.map((participant) => [participant.displayName.toLowerCase(), participant]));

  return getParticipantLoginNames().map((name) => {
    const participant = byParticipant.get(name.toLowerCase());
    return {
      displayName: name,
      online: byStatus.get(name.toLowerCase()) ?? false,
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
