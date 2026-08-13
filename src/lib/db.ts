import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

let databaseInitialization: Promise<void> | null = null;

export function initializeDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL?.startsWith('file:')) return Promise.resolve();
  databaseInitialization ??= (async () => {
    await db.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await db.$queryRawUnsafe('PRAGMA foreign_keys = ON');
    await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
  })();
  return databaseInitialization;
}
