import { PrismaClient } from '@prisma/client'
import { assertDemoDatabaseIfDemo } from './demo/guard'

// Demo mode refuses to start against anything but a demo database.
// This runs before the client exists, so nothing can connect first.
assertDemoDatabaseIfDemo()

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Reuse the client across hot reloads in dev instead of exhausting the
// Postgres connection pool with a new one on every edit.
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
