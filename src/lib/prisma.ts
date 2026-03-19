import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let prisma: PrismaClient | null = null;

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL env var.");
  }
  if (databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a hosted Postgres connection when using postgresql datasource.");
  }

  const adapter = new PrismaPg({
    connectionString: databaseUrl,
  });

  return new PrismaClient({
    adapter,
  });
}

export function getPrisma() {
  if (prisma) return prisma;
  prisma = createPrismaClient();
  return prisma;
}
