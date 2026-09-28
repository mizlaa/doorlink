/**
 * Seeds the marketplace's reference data: service categories,
 * subscription plans and the default commission rate.
 *
 * Run with: npx tsx scripts/seed-marketplace.ts
 *
 * This is configuration, not demo content — these rows are what the
 * product actually offers, so they are upserted (safe to re-run) and
 * live outside prisma/seed.ts, which fabricates example catalogue data.
 */
import { BillingInterval, PrismaClient } from '@prisma/client'
import { COMMISSION_SETTING_KEY, DEFAULT_COMMISSION_BPS } from '../src/lib/commission'

const prisma = new PrismaClient()

const SERVICE_CATEGORIES = [
  { slug: 'garage-door-repair', name: 'Garage door repair', description: 'Door not opening, off its tracks, noisy or damaged.' },
  { slug: 'garage-door-installation', name: 'Garage door installation', description: 'Supply and install a new garage door.' },
  { slug: 'garage-door-replacement', name: 'Garage door replacement', description: 'Replace an existing door, keeping or upgrading the opener.' },
  { slug: 'motor-opener-repair', name: 'Motor / opener repair', description: 'Opener or motor faults, including control board issues.' },
  { slug: 'motor-opener-replacement', name: 'Motor / opener replacement', description: 'Replace a failed or obsolete opener unit.' },
  { slug: 'gate-installation', name: 'Gate installation', description: 'New swing or sliding gate, manual or automated.' },
  { slug: 'gate-repair', name: 'Gate repair', description: 'Gate or gate automation not working correctly.' },
  { slug: 'automated-gate-installation', name: 'Automated gate installation', description: 'Automate an existing gate, or install a new automated gate.' },
  { slug: 'remote-programming', name: 'Remote & keypad programming', description: 'Pair remotes, code keypads, replace lost transmitters.' },
  { slug: 'access-control', name: 'Access control', description: 'Intercoms, keypads, card readers and entry systems.' },
  { slug: 'roller-shutter', name: 'Roller shutter work', description: 'Roller shutter installation, repair or motorisation.' },
  { slug: 'maintenance-service', name: 'Maintenance & servicing', description: 'Scheduled servicing, lubrication, balance and safety checks.' },
  { slug: 'safety-inspection', name: 'Safety inspection', description: 'Inspection and compliance check of an automated system.' },
  { slug: 'emergency-repair', name: 'Emergency repair', description: 'Urgent callout — door or gate stuck, security compromised.' },
  { slug: 'other', name: 'Something else', description: 'Anything not covered by the categories above.' },
]

// Trade accounts subscribe monthly at $9.99 AUD. Weekly and annual plans
// stay in the database for history but are not offered for new sign-ups.
const PLANS = [
  {
    code: 'doorlink-weekly',
    name: 'Doorlink Weekly',
    description: 'Legacy weekly billing.',
    interval: BillingInterval.WEEK,
    priceCents: 499,
    sortOrder: 1,
    isActive: false,
  },
  {
    code: 'doorlink-monthly',
    name: 'Doorlink Trade',
    description: 'Trade access for technicians, suppliers, and manufacturers, billed monthly.',
    interval: BillingInterval.MONTH,
    priceCents: 999,
    sortOrder: 2,
    isActive: true,
  },
  {
    code: 'doorlink-annual',
    name: 'Doorlink Annual',
    description: 'Full access, billed yearly.',
    interval: BillingInterval.YEAR,
    priceCents: null,
    sortOrder: 3,
    isActive: false,
  },
]

async function main() {
  for (const [index, category] of SERVICE_CATEGORIES.entries()) {
    await prisma.serviceCategory.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description, sortOrder: index },
      create: { ...category, sortOrder: index },
    })
  }
  console.log(`  ✓ ${SERVICE_CATEGORIES.length} service categories`)

  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        description: plan.description,
        interval: plan.interval,
        priceCents: plan.priceCents,
        sortOrder: plan.sortOrder,
        isActive: plan.isActive,
      },
      create: { ...plan, currency: 'AUD' },
    })
  }
  console.log(`  ✓ ${PLANS.length} subscription plans (monthly trade plan at $9.99 AUD)`)

  // Seeded only if absent — re-running this script must never reset a
  // rate an admin has deliberately changed.
  const existing = await prisma.platformSetting.findUnique({ where: { key: COMMISSION_SETTING_KEY } })
  if (existing) {
    console.log(`  · commission rate already set (${JSON.stringify(existing.value)} bps) — left alone`)
  } else {
    await prisma.platformSetting.create({
      data: { key: COMMISSION_SETTING_KEY, value: DEFAULT_COMMISSION_BPS },
    })
    console.log(`  ✓ commission rate seeded at ${DEFAULT_COMMISSION_BPS} bps`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
