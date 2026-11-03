import type { PricedProductId } from '@/lib/pricing/engine'
import { companyById } from './data'
import type { DemoState } from './store'

export interface DemoCard {
  id: string
  name: string
  initials: string
  colour: string
  ratingAvg: number
  ratingCount: number
  jobsCompleted: number
}

export interface CardReview {
  id: string
  author: string
  rating: number
  text: string
  when: string
  product: PricedProductId
  reply: string | null
  workmanship: number | null
  communication: number | null
  valueForMoney: number | null
  punctuality: number | null
}

/** A company's reviews: the seed samples plus any left on demo jobs. */
export function reviewsFor(companyId: string, state: DemoState): CardReview[] {
  const fromJobs: CardReview[] = state.jobs
    .filter((j) => j.companyId === companyId && j.review && !state.hiddenReviews.includes(`job-${j.id}`))
    .map((j) => ({
      id: `job-${j.id}`,
      author: j.customerName.split(' ')[0],
      rating: j.review!.rating,
      text: j.review!.body,
      when: new Date(j.review!.at).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }),
      product: 'GARAGE_DOOR' as PricedProductId,
      reply: j.review!.reply,
      workmanship: j.review!.workmanship,
      communication: j.review!.communication,
      valueForMoney: j.review!.valueForMoney,
      punctuality: j.review!.punctuality,
    }))
  const seeded: CardReview[] = state.reviews
    .filter((r) => r.companyId === companyId && !state.hiddenReviews.includes(r.id))
    .map((r) => ({
      id: r.id,
      author: r.author,
      rating: r.rating,
      text: r.text,
      when: new Date(Date.now() - r.daysAgo * 86_400_000).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }),
      product: r.product,
      reply: r.reply,
      workmanship: r.workmanship,
      communication: r.communication,
      valueForMoney: r.valueForMoney,
      punctuality: r.punctuality,
    }))
  return [...fromJobs, ...seeded]
}

export function businessCard(companyId: string, state: DemoState): DemoCard {
  const company = companyById(companyId)!
  const added = state.jobs.filter((j) => j.companyId === companyId && j.review)
  const count = company.reviewCount + added.length
  const sum = company.rating * company.reviewCount + added.reduce((n, j) => n + j.review!.rating, 0)
  return {
    id: company.id,
    name: company.name,
    initials: company.initials,
    colour: company.colour,
    ratingAvg: Math.round((sum / count) * 10) / 10,
    ratingCount: count,
    jobsCompleted: company.completedDemoJobs + state.jobs.filter((j) => j.companyId === companyId && j.status === 'COMPLETED').length,
  }
}

const PORTFOLIO_CAPTIONS: Record<string, string[]> = {
  GARAGE_DOOR: ['Sectional door, charcoal, wide top row', 'Roller door, slate grey', 'Tilt door, sand, flush panel'],
  SLIDING_GATE: ['Aluminium slat sliding gate', 'Sliding gate with pillars and motor'],
  SWING_GATE: ['Double swing gate, tubular steel', 'Swing gate with ram motors'],
  PEDESTRIAN_GATE: ['Pedestrian gate to match the driveway gate'],
  FENCE: ['Slat fence run, 1800 high'],
  WINDOW_SHUTTER: ['Window roller shutter, 39 mm slats'],
  SHOP_SHUTTER: ['Shopfront roller shutter, motorised'],
}

const PORTFOLIO_FILE: Record<string, string[]> = {
  GARAGE_DOOR: ['./portfolio/garage-1.jpg', './portfolio/garage-2.jpg', './portfolio/garage-3.jpg'],
  SLIDING_GATE: ['./portfolio/sliding-1.jpg', './portfolio/sliding-2.jpg'],
  SWING_GATE: ['./portfolio/swing-1.jpg', './portfolio/swing-2.jpg'],
  PEDESTRIAN_GATE: ['./portfolio/pedestrian-1.jpg'],
  FENCE: ['./portfolio/fence-1.jpg'],
  WINDOW_SHUTTER: ['./portfolio/window-shutter-1.jpg'],
  SHOP_SHUTTER: ['./portfolio/shop-shutter-1.jpg'],
}

/** Recent installations: renders from the Doorlink designer, one set per product the company offers. */
export function portfolioFor(companyId: string): Array<{ src: string; caption: string }> {
  const company = companyById(companyId)
  if (!company) return []
  const out: Array<{ src: string; caption: string }> = []
  for (const product of company.products) {
    const files = PORTFOLIO_FILE[product] ?? []
    files.forEach((src, i) => out.push({ src, caption: PORTFOLIO_CAPTIONS[product]?.[i] ?? 'Installation' }))
  }
  return out.slice(0, 6)
}
