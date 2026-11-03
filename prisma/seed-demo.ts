// Demo seed entry point: npm run demo:seed
// Refuses to run unless DOORLINK_DEMO=true and DATABASE_URL names a demo database.
import { PrismaClient } from '@prisma/client'
import { isDemo } from '../src/lib/demo/mode'
import { assertDemoDatabaseUrl } from '../src/lib/demo/guard'
import { resetDemoDatabase } from '../src/lib/demo/seed'

async function main() {
  if (!isDemo()) {
    throw new Error('Demo seed refused: set DOORLINK_DEMO=true to seed the demo database.')
  }
  const name = assertDemoDatabaseUrl(process.env.DATABASE_URL)
  const prisma = new PrismaClient()
  try {
    const result = await resetDemoDatabase(prisma)
    console.log(`Demo database "${name}" reset: ${result.businesses} businesses, ${result.reviews} demo reviews.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
