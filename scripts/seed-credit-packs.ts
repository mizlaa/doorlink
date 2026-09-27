/**
 * Seeds credit packs for garage-door photo preview purchases.
 *
 * Credit counts are how many $0.18 USD generations each AUD price covers,
 * rounded down so a pack is never sold below the API cost.
 *
 * Run with: npx tsx scripts/seed-credit-packs.ts
 */
import { PrismaClient } from '@prisma/client'
import { previewCreditsForPriceCents } from '../src/lib/credits/constants'

const prisma = new PrismaClient()

const PRICES = [
  { priceCents: 900, sortOrder: 1 },
  { priceCents: 1900, sortOrder: 2 },
  { priceCents: 3900, sortOrder: 3 },
]

const PACKS = PRICES.map((price) => {
  const credits = previewCreditsForPriceCents(price.priceCents)
  return {
    code: `preview-${credits}`,
    name: `${credits} preview credits`,
    credits,
    priceCents: price.priceCents,
    sortOrder: price.sortOrder,
  }
})

async function main() {
  await prisma.creditPack.updateMany({
    where: { code: { notIn: PACKS.map((pack) => pack.code) } },
    data: { isActive: false },
  })

  for (const pack of PACKS) {
    await prisma.creditPack.upsert({
      where: { code: pack.code },
      update: {
        name: pack.name,
        credits: pack.credits,
        priceCents: pack.priceCents,
        sortOrder: pack.sortOrder,
        isActive: true,
      },
      create: { ...pack, currency: 'AUD' },
    })
  }
  console.log(`  ✓ ${PACKS.length} credit packs`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
