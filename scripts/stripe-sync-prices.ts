/**
 * Creates Stripe Products and Prices for subscription plans that have a
 * price but no stripePriceId yet.
 *
 * Run with: npx tsx scripts/stripe-sync-prices.ts
 *
 * Requires STRIPE_SECRET_KEY (test mode is fine). Does not overwrite an
 * existing stripePriceId.
 */
import { BillingInterval, PrismaClient } from '@prisma/client'
import Stripe from 'stripe'

const prisma = new PrismaClient()

function stripeInterval(interval: BillingInterval): Stripe.PriceCreateParams.Recurring.Interval {
  switch (interval) {
    case BillingInterval.WEEK:
      return 'week'
    case BillingInterval.MONTH:
      return 'month'
    case BillingInterval.YEAR:
      return 'year'
  }
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    console.error('Set STRIPE_SECRET_KEY before running this script.')
    process.exit(1)
  }

  const stripe = new Stripe(key)
  const plans = await prisma.subscriptionPlan.findMany({
    where: {
      isActive: true,
      priceCents: { not: null },
      stripePriceId: null,
    },
    orderBy: { sortOrder: 'asc' },
  })

  if (plans.length === 0) {
    console.log('No plans need Stripe prices.')
    return
  }

  for (const plan of plans) {
    if (plan.priceCents === null) continue

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description ?? undefined,
      metadata: { planCode: plan.code, planId: plan.id },
    })

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.priceCents,
      currency: plan.currency.toLowerCase(),
      recurring: { interval: stripeInterval(plan.interval) },
      metadata: { planCode: plan.code, planId: plan.id },
    })

    await prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: { stripePriceId: price.id },
    })

    console.log(`  ✓ ${plan.code} → ${price.id}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
