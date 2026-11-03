import { PrismaClient } from '@prisma/client'
import { assertDemoDatabaseUrl } from './guard'
import { DEMO_ACCOUNTS } from './accounts'
import { demoSampleKey } from './assets'
import { DEMO_BUSINESSES, DEMO_REVIEWERS, REVIEW_BODIES, type DemoBusiness } from './data'

/**
 * Demo seed: fictional businesses, accounts, prices, coverage, portfolios,
 * subscriptions and reviews. Writes only to the demo database (checked
 * first). Used by `npm run demo:seed` and by the admin "Reset demo data"
 * action. Ids are fixed strings so the seed is reproducible.
 */

const DAY = 24 * 60 * 60 * 1000

/** Small deterministic PRNG so the same seed always gives the same reviews. */
function prng(seedText: string) {
  let h = 2166136261
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  let state = h >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ratingFor(mix: { five: number; four: number }, roll: number): number {
  if (roll < mix.five) return 5
  if (roll < mix.five + mix.four) return 4
  return 3
}

const PRODUCT_LABEL: Record<string, string> = {
  GARAGE_DOOR: 'Sectional garage door',
  SLIDING_GATE: 'Sliding gate',
  SWING_GATE: 'Swing gate',
  PEDESTRIAN_GATE: 'Pedestrian gate',
  FENCE: 'Fence',
  WINDOW_SHUTTER: 'Window shutter',
  SHOP_SHUTTER: 'Shop shutter',
}

export async function seedDemo(prisma: PrismaClient): Promise<{ businesses: number; reviews: number }> {
  assertDemoDatabaseUrl(process.env.DATABASE_URL)

  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: 'demo-trade' },
    update: {},
    create: {
      code: 'demo-trade',
      name: 'Demo trade listing',
      description: 'Demo only. Nothing is charged.',
      interval: 'MONTH',
      priceCents: 0,
      features: { demo: true },
    },
  })

  // Accounts that sign in from /sign-in.
  const customer = await prisma.user.create({
    data: { email: DEMO_ACCOUNTS.customer, name: 'Alex Demo', role: 'CUSTOMER' },
  })
  await prisma.user.create({
    data: { email: DEMO_ACCOUNTS.admin, name: 'Dana Demo (super admin)', role: 'ADMIN' },
  })

  const reviewers = []
  for (const [index, name] of DEMO_REVIEWERS.entries()) {
    reviewers.push(
      await prisma.user.create({
        data: { email: `reviewer${String(index + 1).padStart(2, '0')}@demo.doorlink`, name, role: 'CUSTOMER' },
      })
    )
  }

  let reviewTotal = 0
  for (const business of DEMO_BUSINESSES) {
    reviewTotal += await seedBusiness(prisma, business, reviewers, customer.id, plan.id)
  }
  return { businesses: DEMO_BUSINESSES.length, reviews: reviewTotal }
}

async function seedBusiness(
  prisma: PrismaClient,
  business: DemoBusiness,
  reviewers: Array<{ id: string }>,
  _customerId: string,
  planId: string
): Promise<number> {
  const orgId = `demo-org-${business.slug}`
  const owner = await prisma.user.create({
    data: { email: business.ownerEmail, name: business.ownerName, role: 'TECHNICIAN', phone: business.phone },
  })

  await prisma.organization.create({
    data: {
      id: orgId,
      name: business.name,
      type: 'TECHNICIAN_COMPANY',
      phone: business.phone,
      email: `alerts@${business.slug}.demo.doorlink`,
      suburb: business.suburb,
      state: business.state,
      postcode: business.postcode,
    },
  })
  await prisma.organizationMember.create({
    data: { organizationId: orgId, userId: owner.id, role: 'OWNER' },
  })
  await prisma.subscription.create({
    data: {
      userId: owner.id,
      planId,
      status: 'ACTIVE',
      currentPeriodStart: new Date(Date.now() - 20 * DAY),
      currentPeriodEnd: new Date(Date.now() + 10 * DAY),
    },
  })

  const profile = await prisma.businessProfile.create({
    data: {
      businessKey: `o_${orgId}`,
      organizationId: orgId,
      status: 'APPROVED',
      statusChangedAt: new Date(),
      logoKey: `demo/logos/${business.name
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}.svg`,
      description: business.description,
      products: business.products,
      warranty: business.warranty,
      leadTimeDays: business.leadTimeDays,
      depositPercent: business.depositPercent,
      stripeAccountId: `acct_demo_${business.slug.replace(/-/g, '_')}`,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeUpdatedAt: new Date(),
    },
  })

  await prisma.businessServiceArea.createMany({
    data: business.coverage.map((area) => ({
      profileId: profile.id,
      fromPostcode: area.from,
      toPostcode: area.to,
      travelFeeCents: area.travelFeeCents,
    })),
  })
  await prisma.businessAccessory.createMany({
    data: business.accessories.map((accessory) => ({
      profileId: profile.id,
      accessory: accessory.id,
      priceCents: accessory.priceCents,
      gst: 'INCLUSIVE',
    })),
  })
  await prisma.businessPortfolioItem.createMany({
    data: business.portfolio.map((item) => ({ profileId: profile.id, imageKey: item.key, caption: item.caption })),
  })
  await prisma.pricingRule.createMany({
    data: business.rules.map((rule) => ({
      organizationId: orgId,
      product: rule.product,
      priceType: rule.priceType,
      motorIncluded: rule.motorIncluded,
      installation: rule.installation,
      installPriceCents: rule.installPriceCents ?? null,
      motorAddOnCents: rule.motorAddOnCents ?? null,
      minWidthMm: rule.minWidthMm,
      maxWidthMm: rule.maxWidthMm,
      minHeightMm: rule.minHeightMm,
      maxHeightMm: rule.maxHeightMm,
      priceCents: rule.priceCents,
      gst: 'INCLUSIVE',
      note: rule.note ?? null,
      active: true,
    })),
  })

  return seedReviews(prisma, business, reviewers, owner.id, orgId)
}

async function seedReviews(
  prisma: PrismaClient,
  business: DemoBusiness,
  reviewers: Array<{ id: string }>,
  ownerId: string,
  orgId: string
): Promise<number> {
  const random = prng(business.slug)
  const now = Date.now()
  const jobs = []
  const reviews = []
  for (let index = 0; index < business.reviewCount; index++) {
    const rating = ratingFor(business.ratingMix, random())
    const product = business.products[index % business.products.length]
    const completedAt = new Date(now - (14 + Math.floor(random() * 330)) * DAY)
    const reviewer = reviewers[(index + Math.floor(random() * reviewers.length)) % reviewers.length]
    const jobId = `demo-job-${business.slug}-${index + 1}`
    const body = REVIEW_BODIES[rating][Math.floor(random() * REVIEW_BODIES[rating].length)]
    const detail = () => Math.min(5, Math.max(1, rating + (random() < 0.3 ? -1 : random() < 0.4 ? 1 : 0)))

    jobs.push({
      id: jobId,
      reference: `DEMO-${business.slug.slice(0, 8).toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
      customerId: reviewer.id,
      workerId: ownerId,
      organizationId: orgId,
      description: `${PRODUCT_LABEL[product] ?? product} (demo job)`,
      status: 'COMPLETED' as const,
      priceType: 'FIXED' as const,
      agreedPriceCents: 150000 + Math.floor(random() * 120) * 1000,
      agreedExGstCents: 136000,
      depositPercent: 100,
      completedAt,
      businessCompletedAt: completedAt,
      createdAt: new Date(completedAt.getTime() - 14 * DAY),
    })

    const hasPhoto = random() < 0.2
    const replied = random() < 0.3
    reviews.push({
      id: `demo-review-${business.slug}-${index + 1}`,
      jobId,
      authorId: reviewer.id,
      workerId: ownerId,
      rating,
      body,
      workmanship: detail(),
      communication: detail(),
      valueForMoney: detail(),
      punctuality: detail(),
      recommend: rating >= 4,
      photoKeys: hasPhoto ? [demoSampleKey('reviews')] : [],
      status: 'PUBLISHED' as const,
      workerReply: replied ? 'Thanks for the review. We appreciate you booking through Doorlink.' : null,
      workerRepliedAt: replied ? new Date(completedAt.getTime() + 3 * DAY) : null,
      createdAt: new Date(completedAt.getTime() + (1 + Math.floor(random() * 5)) * DAY),
    })
  }
  await prisma.job.createMany({ data: jobs })
  await prisma.workerReview.createMany({ data: reviews })
  return reviews.length
}

/**
 * Empties every table in the demo database, then seeds it again. The
 * database name is checked first, so this cannot touch anything else.
 */
export async function resetDemoDatabase(prisma: PrismaClient, databaseUrl = process.env.DATABASE_URL) {
  assertDemoDatabaseUrl(databaseUrl)
  const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  )
  if (tables.length > 0) {
    const names = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} CASCADE`)
  }
  return seedDemo(prisma)
}
