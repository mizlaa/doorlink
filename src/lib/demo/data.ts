/**
 * Fictional seed data for the demo. Nothing here is a real business, person,
 * price or review. Business names were checked against public listings and
 * none of them is a real trading name.
 */

export type DemoProduct = 'GARAGE_DOOR' | 'SLIDING_GATE' | 'SWING_GATE' | 'PEDESTRIAN_GATE' | 'FENCE' | 'WINDOW_SHUTTER' | 'SHOP_SHUTTER'
export type DemoPriceType = 'FIXED' | 'ESTIMATE'

export interface DemoRule {
  product: DemoProduct
  priceType: DemoPriceType
  motorIncluded: boolean
  installation: 'INCLUDED' | 'SEPARATE' | 'NOT_INCLUDED'
  installPriceCents?: number
  motorAddOnCents?: number
  minWidthMm: number
  maxWidthMm: number
  minHeightMm: number
  maxHeightMm: number
  priceCents: number
  note?: string
}

export interface DemoBusiness {
  slug: string
  name: string
  suburb: string
  state: 'NSW'
  postcode: string
  phone: string
  description: string
  products: DemoProduct[]
  warranty: string
  leadTimeDays: number
  depositPercent: number
  /** Inclusive postcode ranges and travel fees in cents. */
  coverage: Array<{ from: string; to: string; travelFeeCents: number }>
  accessories: Array<{ id: string; priceCents: number }>
  rules: DemoRule[]
  portfolio: Array<{ key: string; caption: string }>
  /** Share of ratings at 5 and 4; the remainder are 3s. */
  ratingMix: { five: number; four: number }
  reviewCount: number
  ownerEmail: string
  ownerName: string
}

const GARAGE_ACCESSORIES = [
  { id: 'extra-remote', priceCents: 9500 },
  { id: 'wall-keypad', priceCents: 14500 },
  { id: 'safety-beams', priceCents: 18000 },
  { id: 'battery-backup', priceCents: 21000 },
]

export const DEMO_BUSINESSES: DemoBusiness[] = [
  {
    slug: 'harbourline',
    name: 'Harbourline Doors',
    suburb: 'Rozelle',
    state: 'NSW',
    postcode: '2039',
    phone: '02 5550 0101',
    description:
      'Sectional and tilt garage doors for homes and townhouses across Sydney. Free measure, clear fixed prices and a two-person install crew.',
    products: ['GARAGE_DOOR'],
    warranty: '5 years on the door, 2 years on the motor and parts',
    leadTimeDays: 14,
    depositPercent: 20,
    coverage: [{ from: '2000', to: '2250', travelFeeCents: 0 }],
    accessories: GARAGE_ACCESSORIES,
    rules: [
      {
        product: 'GARAGE_DOOR', priceType: 'FIXED', motorIncluded: true, installation: 'INCLUDED',
        minWidthMm: 2000, maxWidthMm: 6000, minHeightMm: 1800, maxHeightMm: 3000, priceCents: 289000,
        note: 'Sectional door with motor, installed',
      },
      {
        product: 'GARAGE_DOOR', priceType: 'FIXED', motorIncluded: false, installation: 'INCLUDED',
        motorAddOnCents: 60000, minWidthMm: 2000, maxWidthMm: 6000, minHeightMm: 1800, maxHeightMm: 3000, priceCents: 229000,
        note: 'Sectional door, installed. Motor can be added.',
      },
    ],
    portfolio: [
      { key: 'demo/portfolio/sectional-timber-look.svg', caption: 'Timber-look sectional, terrace house' },
      { key: 'demo/portfolio/sectional-charcoal.svg', caption: 'Charcoal sectional with side pedestrian door' },
      { key: 'demo/portfolio/sliding-gate-slat.svg', caption: 'Double garage, insulated panels' },
    ],
    ratingMix: { five: 0.62, four: 0.33 },
    reviewCount: 40,
    ownerEmail: 'owner@demo.doorlink',
    ownerName: 'Jordan Demo',
  },
  {
    slug: 'coastal-crest',
    name: 'Coastal Crest Garage Doors',
    suburb: 'Maroubra',
    state: 'NSW',
    postcode: '2035',
    phone: '02 5550 0102',
    description:
      'Garage door replacements and repairs on the eastern suburbs. Most jobs are priced after a short site visit, so the price is an estimate until then.',
    products: ['GARAGE_DOOR'],
    warranty: '3 years on installation, manufacturer warranty on the door',
    leadTimeDays: 21,
    depositPercent: 30,
    coverage: [{ from: '2000', to: '2300', travelFeeCents: 0 }],
    accessories: [
      { id: 'smart-control', priceCents: 22000 },
      { id: 'battery-backup', priceCents: 18000 },
      { id: 'extra-remote', priceCents: 9000 },
    ],
    rules: [
      {
        product: 'GARAGE_DOOR', priceType: 'ESTIMATE', motorIncluded: true, installation: 'INCLUDED',
        minWidthMm: 2000, maxWidthMm: 6500, minHeightMm: 1800, maxHeightMm: 3200, priceCents: 265000,
        note: 'Estimate from the design. Final price after a site check.',
      },
    ],
    portfolio: [
      { key: 'demo/portfolio/sectional-charcoal.svg', caption: 'Charcoal sectional, Maroubra' },
      { key: 'demo/portfolio/sectional-timber-look.svg', caption: 'Timber-look replacement, same opening' },
    ],
    ratingMix: { five: 0.58, four: 0.35 },
    reviewCount: 30,
    ownerEmail: 'owner.coastal@demo.doorlink',
    ownerName: 'Riley Demo',
  },
  {
    slug: 'parramatta-gate-works',
    name: 'Parramatta Gate Works',
    suburb: 'Parramatta',
    state: 'NSW',
    postcode: '2150',
    phone: '02 5550 0103',
    description:
      'Sliding, swing and pedestrian gates, automated or manual. Steel and aluminium, made to measure and installed by our own crew.',
    products: ['SLIDING_GATE', 'SWING_GATE', 'PEDESTRIAN_GATE'],
    warranty: '5 years on fabrication, 2 years on automation',
    leadTimeDays: 28,
    depositPercent: 25,
    coverage: [
      { from: '2100', to: '2199', travelFeeCents: 9000 },
      { from: '2140', to: '2160', travelFeeCents: 0 },
    ],
    accessories: [
      { id: 'wall-keypad', priceCents: 15500 },
      { id: 'safety-beams', priceCents: 16500 },
      { id: 'smart-control', priceCents: 24000 },
    ],
    rules: [
      {
        product: 'SLIDING_GATE', priceType: 'FIXED', motorIncluded: true, installation: 'INCLUDED',
        minWidthMm: 3000, maxWidthMm: 6000, minHeightMm: 1000, maxHeightMm: 2000, priceCents: 189000,
        note: 'Sliding gate with motor, installed',
      },
      {
        product: 'SWING_GATE', priceType: 'ESTIMATE', motorIncluded: true, installation: 'SEPARATE', installPriceCents: 35000,
        minWidthMm: 2000, maxWidthMm: 5000, minHeightMm: 1000, maxHeightMm: 2200, priceCents: 165000,
        note: 'Gate and motor. Installation priced separately.',
      },
      {
        product: 'PEDESTRIAN_GATE', priceType: 'FIXED', motorIncluded: false, installation: 'INCLUDED',
        motorAddOnCents: 45000, minWidthMm: 800, maxWidthMm: 1500, minHeightMm: 1000, maxHeightMm: 2100, priceCents: 129000,
        note: 'Aluminium pedestrian gate, installed',
      },
    ],
    portfolio: [
      { key: 'demo/portfolio/sliding-gate-slat.svg', caption: 'Slat sliding gate, Parramatta' },
      { key: 'demo/portfolio/swing-gate-steel.svg', caption: 'Steel swing gate with motor' },
      { key: 'demo/portfolio/pedestrian-gate-aluminium.svg', caption: 'Aluminium pedestrian gate' },
      { key: 'demo/portfolio/fence-slat-privacy.svg', caption: 'Privacy slat fence and gate' },
    ],
    ratingMix: { five: 0.55, four: 0.35 },
    reviewCount: 22,
    ownerEmail: 'owner.parramatta@demo.doorlink',
    ownerName: 'Sam Demo',
  },
  {
    slug: 'westbrook-roller',
    name: 'Westbrook Roller Co',
    suburb: 'Penrith',
    state: 'NSW',
    postcode: '2750',
    phone: '02 5550 0104',
    description:
      'Window and shop roller shutters for homes and businesses in the west. Manual or motorised, with security slats and a clear quote before we start.',
    products: ['WINDOW_SHUTTER', 'SHOP_SHUTTER'],
    warranty: '5 years on the shutter, 2 years on the motor',
    leadTimeDays: 18,
    depositPercent: 100,
    coverage: [{ from: '2740', to: '2790', travelFeeCents: 4000 }],
    accessories: [
      { id: 'extra-remote', priceCents: 9500 },
      { id: 'wall-keypad', priceCents: 13500 },
      { id: 'battery-backup', priceCents: 19500 },
    ],
    rules: [
      {
        product: 'WINDOW_SHUTTER', priceType: 'FIXED', motorIncluded: true, installation: 'INCLUDED',
        minWidthMm: 600, maxWidthMm: 2400, minHeightMm: 600, maxHeightMm: 2400, priceCents: 74900,
        note: 'Motorised window shutter, installed',
      },
      {
        product: 'SHOP_SHUTTER', priceType: 'ESTIMATE', motorIncluded: true, installation: 'INCLUDED',
        minWidthMm: 2000, maxWidthMm: 6000, minHeightMm: 2000, maxHeightMm: 4000, priceCents: 389000,
        note: 'Shopfront shutter. Estimate after a site visit.',
      },
    ],
    portfolio: [
      { key: 'demo/portfolio/window-shutter-roller.svg', caption: 'Roller window shutter, Penrith' },
      { key: 'demo/portfolio/window-shutter-plantation.svg', caption: 'Security roller shutter on a family home' },
      { key: 'demo/portfolio/shop-shutter-roller.svg', caption: 'Shopfront roller shutter' },
    ],
    ratingMix: { five: 0.45, four: 0.4 },
    reviewCount: 14,
    ownerEmail: 'owner.westbrook@demo.doorlink',
    ownerName: 'Casey Demo',
  },
  {
    slug: 'ridgeline-shutter',
    name: 'Ridgeline Shutter Studio',
    suburb: 'Chatswood',
    state: 'NSW',
    postcode: '2067',
    phone: '02 5550 0105',
    description:
      'Timber-look and aluminium window shutters for the North Shore. Shop shutters are not something we price online; ask us for a custom quote.',
    products: ['WINDOW_SHUTTER', 'SHOP_SHUTTER'],
    warranty: '3 years on shutters and fittings',
    leadTimeDays: 35,
    depositPercent: 100,
    coverage: [{ from: '2060', to: '2099', travelFeeCents: 0 }],
    accessories: [
      { id: 'extra-remote', priceCents: 4500 },
      { id: 'wall-keypad', priceCents: 14000 },
    ],
    rules: [
      {
        product: 'WINDOW_SHUTTER', priceType: 'FIXED', motorIncluded: false, installation: 'INCLUDED',
        motorAddOnCents: 42000, minWidthMm: 600, maxWidthMm: 1800, minHeightMm: 600, maxHeightMm: 2100, priceCents: 68500,
        note: 'Aluminium window shutter, manual, installed',
      },
    ],
    portfolio: [
      { key: 'demo/portfolio/window-shutter-plantation.svg', caption: 'Plantation shutters, Chatswood' },
      { key: 'demo/portfolio/window-shutter-roller.svg', caption: 'Aluminium window shutter, manual' },
      { key: 'demo/portfolio/shop-shutter-roller.svg', caption: 'Shopfront job, custom quote' },
    ],
    ratingMix: { five: 0.35, four: 0.48 },
    reviewCount: 9,
    ownerEmail: 'owner.ridgeline@demo.doorlink',
    ownerName: 'Morgan Demo',
  },
  {
    slug: 'blue-mountain-automation',
    name: 'Blue Mountain Automation',
    suburb: 'Glenbrook',
    state: 'NSW',
    postcode: '2773',
    phone: '02 5550 0106',
    description:
      'Gate motors and automation for the Blue Mountains and Penrith. We take over existing gates and fit remote, keypad and smartphone control.',
    products: ['SWING_GATE', 'SLIDING_GATE'],
    warranty: '2 years on automation, 12 months on labour',
    leadTimeDays: 10,
    depositPercent: 100,
    coverage: [
      { from: '2750', to: '2790', travelFeeCents: 9000 },
      { from: '2780', to: '2790', travelFeeCents: 0 },
    ],
    accessories: [
      { id: 'smart-control', priceCents: 19500 },
      { id: 'safety-beams', priceCents: 15000 },
      { id: 'extra-remote', priceCents: 8500 },
    ],
    rules: [
      {
        product: 'SWING_GATE', priceType: 'FIXED', motorIncluded: true, installation: 'INCLUDED',
        minWidthMm: 2000, maxWidthMm: 5000, minHeightMm: 1000, maxHeightMm: 2200, priceCents: 165000,
        note: 'Swing gate motor kit, installed',
      },
      {
        product: 'SLIDING_GATE', priceType: 'ESTIMATE', motorIncluded: true, installation: 'INCLUDED',
        minWidthMm: 3000, maxWidthMm: 6000, minHeightMm: 1000, maxHeightMm: 2000, priceCents: 175000,
        note: 'Sliding gate motor. Estimate after checking the gate.',
      },
    ],
    portfolio: [
      { key: 'demo/portfolio/swing-gate-steel.svg', caption: 'Steel swing gate, automated' },
      { key: 'demo/portfolio/sliding-gate-slat.svg', caption: 'Sliding gate motor, Glenbrook' },
      { key: 'demo/portfolio/pedestrian-gate-aluminium.svg', caption: 'Pedestrian gate with keypad' },
    ],
    ratingMix: { five: 0.5, four: 0.38 },
    reviewCount: 18,
    ownerEmail: 'owner.bluemountain@demo.doorlink',
    ownerName: 'Taylor Demo',
  },
  {
    slug: 'kingsford-gate-fence',
    name: 'Kingsford Gate & Fence',
    suburb: 'Kingsford',
    state: 'NSW',
    postcode: '2032',
    phone: '02 5550 0107',
    description:
      'Colorbond and timber fences, pedestrian and swing gates for the eastern suburbs. Simple pricing per metre and per gate.',
    products: ['FENCE', 'PEDESTRIAN_GATE', 'SWING_GATE'],
    warranty: '5 years on fencing, 2 years on gate hardware',
    leadTimeDays: 12,
    depositPercent: 100,
    coverage: [{ from: '1990', to: '2040', travelFeeCents: 0 }],
    accessories: [
      { id: 'wall-keypad', priceCents: 14000 },
      { id: 'smart-control', priceCents: 23000 },
    ],
    rules: [
      {
        product: 'FENCE', priceType: 'FIXED', motorIncluded: false, installation: 'INCLUDED',
        minWidthMm: 1000, maxWidthMm: 6000, minHeightMm: 1000, maxHeightMm: 2400, priceCents: 62000,
        note: 'Colorbond fence panel run, installed',
      },
      {
        product: 'PEDESTRIAN_GATE', priceType: 'FIXED', motorIncluded: false, installation: 'INCLUDED',
        motorAddOnCents: 45000, minWidthMm: 800, maxWidthMm: 1500, minHeightMm: 1000, maxHeightMm: 2100, priceCents: 98000,
        note: 'Timber pedestrian gate, installed',
      },
    ],
    portfolio: [
      { key: 'demo/portfolio/fence-slat-privacy.svg', caption: 'Privacy slat fence, Kingsford' },
      { key: 'demo/portfolio/pedestrian-gate-aluminium.svg', caption: 'Pedestrian gate, timber frame' },
      { key: 'demo/portfolio/swing-gate-steel.svg', caption: 'Driveway swing gate' },
    ],
    ratingMix: { five: 0.4, four: 0.45 },
    reviewCount: 10,
    ownerEmail: 'owner.kingsford@demo.doorlink',
    ownerName: 'Drew Demo',
  },
]

/** Fictional reviewers. Initials only, as the marketplace shows them. */
export const DEMO_REVIEWERS = [
  'Maya Thornton', 'Tom Hadley', 'Priya Nair', 'Liam Okafor', 'Grace Lindqvist', 'Oscar Brennan',
  'Chloe Marsh', 'Daniel Ferreira', 'Hannah Ko', 'Ethan Walsh', 'Sofia Reyes', 'Ben Farrow',
]

export const REVIEW_BODIES: Record<number, string[]> = {
  5: [
    'Booked online, the quote matched exactly what was installed. Crew were tidy and finished on the day.',
    'Really happy with the result. Explained the motor options clearly and the remote setup took two minutes.',
    'Quick, clean and no surprises on the invoice. Would book again.',
    'Excellent communication from the first call to the last check. The new one runs quietly.',
    'Measured carefully, installed neatly and cleaned up after themselves. Great value.',
  ],
  4: [
    'Good work overall. Install ran a little later than the date given but they kept me updated.',
    'Solid job and fair price. The keypad took a bit of setting up but support answered quickly.',
    'Happy with it. Would have liked a call before they arrived, but the work itself is very good.',
    'Friendly team and a neat finish. Two small touch-ups were done the next week.',
  ],
  3: [
    'Job was fine but the timing slipped twice. Final result is good.',
    'Price was as quoted, communication could have been better during the wait.',
  ],
}

export const REVIEW_DETAILS = ['workmanship', 'communication', 'valueForMoney', 'punctuality'] as const
