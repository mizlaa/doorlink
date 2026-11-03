import seed from './seed-data.json'
import type { RuleTerms, PricedProductId } from '@/lib/pricing/engine'
import type { MotorCandidate } from '@/lib/motors/specs'

/**
 * Demo seed. Every company, person, price, review and job here is
 * fictional, taken from DEMO_DATA.json and extended only with the fields
 * the app's screens need (pricing rules, coverage, accessories).
 */

export const DEMO_NOTICE: string = seed.notice

export type DemoRoleId = 'customer' | 'installer' | 'supplier' | 'manufacturer' | 'admin'

export interface DemoAccount {
  role: DemoRoleId
  email: string
  password: string
  name: string
  /** The Role the real app would give this account. */
  appRole: 'CUSTOMER' | 'TECHNICIAN' | 'SUPPLIER' | 'MANUFACTURER' | 'ADMIN'
  /** The demo company this account manages, for business roles. */
  companyId?: string
}

const ACCOUNT_NAMES: Record<DemoRoleId, { name: string; appRole: DemoAccount['appRole']; companyId?: string }> = {
  customer: { name: 'Alex Morgan', appRole: 'CUSTOMER' },
  installer: { name: 'Jordan Lee', appRole: 'TECHNICIAN', companyId: 'company_01' },
  supplier: { name: 'Sam Patel', appRole: 'SUPPLIER', companyId: 'company_03' },
  manufacturer: { name: 'Riley Chen', appRole: 'MANUFACTURER', companyId: 'company_08' },
  admin: { name: 'Doorlink Admin', appRole: 'ADMIN' },
}

export const DEMO_ACCOUNTS: DemoAccount[] = seed.demo_accounts.map((a) => ({
  role: a.role as DemoRoleId,
  email: a.email,
  password: a.password,
  ...ACCOUNT_NAMES[a.role as DemoRoleId],
}))

export const DEMO_PASSWORD = seed.demo_accounts[0].password

export interface Company {
  id: string
  name: string
  suburb: string
  specialty: string
  rating: number
  reviewCount: number
  responseTime: string
  completedDemoJobs: number
  brand: string | null
  initials: string
  colour: string
  description: string
  warrantyYears: number
  leadTimeDays: number
  depositPercent: number
  products: PricedProductId[]
  coverage: Array<{ from: string; to: string; travelFeeCents: number }>
  accessories: Array<{ accessory: string; priceCents: number; gst: 'INCLUSIVE' }>
  abn: string
  phone: string
}

const COMPANY_EXTRAS: Record<
  string,
  Pick<Company, 'brand' | 'colour' | 'description' | 'products' | 'depositPercent'> & { styles: string[]; travel: number }
> = {
  company_01: {
    brand: 'Westline',
    colour: '#1769D2',
    description:
      'Sectional, roller and tilt garage doors across Sydney’s south-west. Free measure, fixed prices and a two-person install crew.',
    products: ['GARAGE_DOOR'],
    styles: ['sectional', 'roller', 'tilt'],
    depositPercent: 20,
    travel: 0,
  },
  company_02: {
    brand: 'Summit Entry',
    colour: '#0F766E',
    description: 'Garage doors and automated sliding and swing gates. Same-day replies and clear itemised quotes.',
    products: ['GARAGE_DOOR', 'SLIDING_GATE', 'SWING_GATE'],
    styles: ['sectional', 'roller'],
    depositPercent: 25,
    travel: 4500,
  },
  company_03: {
    brand: 'Bluegum',
    colour: '#2E7D46',
    description:
      'Motors, openers and automation for doors, gates and shutters. Smart controls, battery backup and safety beams fitted properly.',
    products: ['GARAGE_DOOR', 'SLIDING_GATE', 'SWING_GATE', 'WINDOW_SHUTTER'],
    styles: ['sectional'],
    depositPercent: 30,
    travel: 0,
  },
  company_04: {
    brand: 'MetroSpan',
    colour: '#B4530A',
    description: 'Residential garage doors for Bankstown and the inner south-west. Over 180 reviewed jobs on the platform.',
    products: ['GARAGE_DOOR'],
    styles: ['sectional', 'roller', 'tilt'],
    depositPercent: 20,
    travel: 6000,
  },
  company_05: {
    brand: 'Crestview',
    colour: '#6B4FBF',
    description: 'Commercial and residential access: shop shutters, high-cycle doors and automated gates.',
    products: ['GARAGE_DOOR', 'SHOP_SHUTTER', 'SLIDING_GATE'],
    styles: ['sectional', 'roller'],
    depositPercent: 30,
    travel: 0,
  },
  company_06: {
    brand: null,
    colour: '#8A4B2A',
    description: 'Made-to-measure sliding, swing and pedestrian gates and matching fences, in aluminium and steel.',
    products: ['GARAGE_DOOR', 'SLIDING_GATE', 'SWING_GATE', 'PEDESTRIAN_GATE', 'FENCE'],
    styles: ['sectional'],
    depositPercent: 25,
    travel: 0,
  },
  company_07: {
    brand: null,
    colour: '#0E6E8C',
    description: 'Window and shop roller shutters, plus roller garage doors. Security slats and motorised options.',
    products: ['GARAGE_DOOR', 'WINDOW_SHUTTER', 'SHOP_SHUTTER'],
    styles: ['sectional', 'roller'],
    depositPercent: 100,
    travel: 5000,
  },
  company_08: {
    brand: 'Crestview',
    colour: '#334155',
    description:
      'Fabrication and installation: doors, gates and fences built in our own workshop in Wetherill Park.',
    products: ['GARAGE_DOOR', 'SLIDING_GATE', 'SWING_GATE', 'PEDESTRIAN_GATE', 'FENCE'],
    styles: ['sectional', 'tilt'],
    depositPercent: 25,
    travel: 0,
  },
}

const ACCESSORY_PRICES: Record<string, number> = {
  'extra-remote': 9500,
  'wall-keypad': 14500,
  'safety-beams': 18000,
  'battery-backup': 21000,
  'smart-control': 24000,
}

function initialsOf(name: string): string {
  return name
    .replace(/&/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export const COMPANIES: Company[] = seed.companies.map((c, index) => {
  const extra = COMPANY_EXTRAS[c.id]
  const quote = seed.quotes.find((q) => q.companyId === c.id)
  const accessoryIds = Object.keys(ACCESSORY_PRICES).filter((_, i) => (i + index) % 5 !== 4)
  return {
    id: c.id,
    name: c.name,
    suburb: c.suburb,
    specialty: c.specialty,
    rating: c.rating,
    reviewCount: c.reviewCount,
    responseTime: c.responseTime,
    completedDemoJobs: c.completedDemoJobs,
    brand: extra.brand,
    initials: initialsOf(c.name),
    colour: extra.colour,
    description: extra.description,
    warrantyYears: quote?.warrantyYears ?? 3,
    leadTimeDays: quote?.leadTimeDays ?? 14,
    depositPercent: extra.depositPercent,
    products: extra.products,
    coverage: [
      { from: '2000', to: '2249', travelFeeCents: extra.travel },
      { from: '2555', to: '2780', travelFeeCents: 0 },
    ],
    accessories: accessoryIds.map((id) => ({
      accessory: id,
      priceCents: ACCESSORY_PRICES[id] + index * 500,
      gst: 'INCLUSIVE' as const,
    })),
    abn: `${51 + index} ${String(824 + index * 7).padStart(3, '0')} ${String(117 + index * 31).padStart(3, '0')} ${String(400 + index * 13).padStart(3, '0')}`,
    phone: `02 5550 ${String(1001 + index).padStart(4, '0')}`,
  }
})

export function companyById(id: string | null | undefined): Company | undefined {
  return COMPANIES.find((c) => c.id === id)
}

/** The installed price of the reference door (sectional 2400 × 2100, motor, installed). */
function referencePriceCents(companyId: string): number {
  const quote = seed.quotes.find((q) => q.companyId === companyId)
  return Math.round((quote?.totalIncGstAUD ?? 3200) * 100)
}

const STYLE_FACTOR: Record<string, number> = { sectional: 1, roller: 0.72, tilt: 0.86 }
const SIZE_BANDS = [
  { minW: 1800, maxW: 2700, factor: 1 },
  { minW: 2701, maxW: 3600, factor: 1.22 },
  { minW: 3601, maxW: 5600, factor: 1.58 },
]
const round50 = (cents: number) => Math.round(cents / 5000) * 5000

/** Each company's pricing rules, built from its demo quote so the numbers stay consistent. */
export function seedRules(): Record<string, RuleTerms[]> {
  const out: Record<string, RuleTerms[]> = {}
  for (const company of COMPANIES) {
    const extra = COMPANY_EXTRAS[company.id]
    const base = referencePriceCents(company.id)
    const rules: RuleTerms[] = []
    const common = {
      productModel: null,
      material: null,
      gst: 'INCLUSIVE' as const,
      currency: 'AUD',
      active: true,
      minHeightMm: 1800,
      maxHeightMm: 3000,
    }
    let n = 0
    const id = () => `${company.id}-r${++n}`
    for (const style of extra.styles) {
      for (const band of SIZE_BANDS) {
        const installed = round50(base * STYLE_FACTOR[style] * band.factor)
        const install = round50(installed * 0.16)
        rules.push({
          ...common,
          id: id(),
          product: 'GARAGE_DOOR',
          productStyle: style,
          productBrand: company.brand,
          priceType: company.id === 'company_05' ? 'ESTIMATE' : 'FIXED',
          motorIncluded: true,
          motorBrand: null,
          motorAddOnCents: null,
          installation: 'INCLUDED',
          installPriceCents: null,
          minWidthMm: band.minW,
          maxWidthMm: band.maxW,
          priceCents: installed,
          note: `${style[0].toUpperCase()}${style.slice(1)} door with motor${company.brand ? `, ${company.brand} range` : ''}.`,
        })
        rules.push({
          ...common,
          id: id(),
          product: 'GARAGE_DOOR',
          productStyle: style,
          productBrand: null,
          priceType: 'FIXED',
          motorIncluded: false,
          motorBrand: null,
          motorAddOnCents: 79000,
          installation: 'SEPARATE',
          installPriceCents: install,
          minWidthMm: band.minW,
          maxWidthMm: band.maxW,
          priceCents: installed - install - 69000,
          note: 'Supply, installation itemised. Motor can be added.',
        })
      }
    }
    const gate = (product: PricedProductId, price: number, minW: number, maxW: number) => {
      const scaled = round50(price * (base / 330000))
      rules.push({
        ...common,
        id: id(),
        product,
        productStyle: null,
        productBrand: company.brand,
        priceType: 'FIXED',
        motorIncluded: product !== 'PEDESTRIAN_GATE',
        motorBrand: null,
        motorAddOnCents: product === 'PEDESTRIAN_GATE' ? 52000 : null,
        installation: 'INCLUDED',
        installPriceCents: null,
        minWidthMm: minW,
        maxWidthMm: maxW,
        minHeightMm: 800,
        maxHeightMm: 2400,
        priceCents: scaled,
        note: product === 'PEDESTRIAN_GATE' ? 'Pedestrian gate, installed.' : 'Gate with motor, installed.',
      })
      if (product !== 'PEDESTRIAN_GATE') {
        rules.push({
          ...common,
          id: id(),
          product,
          productStyle: null,
          productBrand: null,
          priceType: 'FIXED',
          motorIncluded: false,
          motorBrand: null,
          motorAddOnCents: 115000,
          installation: 'INCLUDED',
          installPriceCents: null,
          minWidthMm: minW,
          maxWidthMm: maxW,
          minHeightMm: 800,
          maxHeightMm: 2400,
          priceCents: scaled - 98000,
          note: 'Manual gate, installed. Motor available.',
        })
      }
    }
    if (company.products.includes('SLIDING_GATE')) {
      gate('SLIDING_GATE', 520000, 2500, 4500)
      gate('SLIDING_GATE', 690000, 4501, 8000)
    }
    if (company.products.includes('SWING_GATE')) {
      gate('SWING_GATE', 460000, 2400, 4200)
      gate('SWING_GATE', 610000, 4201, 6000)
    }
    if (company.products.includes('PEDESTRIAN_GATE')) gate('PEDESTRIAN_GATE', 148000, 700, 1600)
    if (company.products.includes('FENCE')) {
      for (const [minW, maxW, price] of [
        [1000, 8000, 260000],
        [8001, 16000, 470000],
        [16001, 40000, 840000],
      ]) {
        rules.push({
          ...common,
          id: id(),
          product: 'FENCE',
          productStyle: null,
          productBrand: null,
          priceType: 'ESTIMATE',
          motorIncluded: false,
          motorBrand: null,
          motorAddOnCents: null,
          installation: 'INCLUDED',
          installPriceCents: null,
          minWidthMm: minW,
          maxWidthMm: maxW,
          minHeightMm: 900,
          maxHeightMm: 2400,
          priceCents: round50(price * (base / 330000)),
          note: 'Fence run, installed. Estimate until measured on site.',
        })
      }
    }
    const shutter = (product: PricedProductId, minW: number, maxW: number, minH: number, maxH: number, price: number) => {
      const scaled = round50(price * (base / 330000))
      rules.push({
        ...common,
        id: id(),
        product,
        productStyle: null,
        productBrand: null,
        priceType: product === 'SHOP_SHUTTER' ? 'ESTIMATE' : 'FIXED',
        motorIncluded: true,
        motorBrand: null,
        motorAddOnCents: null,
        installation: 'INCLUDED',
        installPriceCents: null,
        minWidthMm: minW,
        maxWidthMm: maxW,
        minHeightMm: minH,
        maxHeightMm: maxH,
        priceCents: scaled,
        note: 'Motorised shutter, installed.',
      })
      rules.push({
        ...common,
        id: id(),
        product,
        productStyle: null,
        productBrand: null,
        priceType: 'FIXED',
        motorIncluded: false,
        motorBrand: null,
        motorAddOnCents: round50(scaled * 0.28),
        installation: 'INCLUDED',
        installPriceCents: null,
        minWidthMm: minW,
        maxWidthMm: maxW,
        minHeightMm: minH,
        maxHeightMm: maxH,
        priceCents: round50(scaled * 0.74),
        note: 'Manual shutter, installed.',
      })
    }
    if (company.products.includes('WINDOW_SHUTTER')) {
      shutter('WINDOW_SHUTTER', 500, 2400, 500, 2400, 98000)
      shutter('WINDOW_SHUTTER', 2401, 4500, 500, 2700, 156000)
    }
    if (company.products.includes('SHOP_SHUTTER')) {
      shutter('SHOP_SHUTTER', 1800, 4000, 1800, 4000, 520000)
      shutter('SHOP_SHUTTER', 4001, 7500, 1800, 4500, 760000)
    }
    out[company.id] = rules
  }
  return out
}

export interface DemoReview {
  id: string
  companyId: string
  author: string
  rating: number
  text: string
  workmanship: number
  communication: number
  valueForMoney: number
  punctuality: number
  daysAgo: number
  reply: string | null
  product: PricedProductId
}

const REVIEW_NAMES = ['Priya N.', 'Tom H.', 'Maya T.', 'Liam O.', 'Grace L.', 'Oscar B.', 'Chloe M.', 'Daniel F.', 'Hannah K.', 'Ethan W.', 'Sofia R.', 'Ben F.']

export const SEED_REVIEWS: DemoReview[] = seed.reviews.map((r, i) => {
  const company = COMPANIES.find((c) => c.id === r.companyId)!
  return {
    id: r.id,
    companyId: r.companyId,
    author: REVIEW_NAMES[i % REVIEW_NAMES.length],
    rating: r.rating,
    text: r.text,
    workmanship: Math.min(5, r.rating + (i % 3 === 0 ? 0 : 1)),
    communication: 5,
    valueForMoney: r.rating,
    punctuality: Math.min(5, r.rating + (i % 2)),
    daysAgo: 6 + ((i * 37) % 300),
    reply: i % 4 === 1 ? 'Thanks for the kind words. Glad the new door is working well.' : null,
    product: company.products[i % company.products.length],
  }
})

export const PRODUCT_CATEGORIES: string[] = seed.product_categories
export const BRANDS: string[] = seed.brands

export interface SeedLead {
  reference: string
  title: string
  suburb: string
  postcode: string
  state: string
  status: 'Open' | 'Quoted' | 'Scheduled'
  budgetAUD: number
  description: string
  category: string
  urgency: 'STANDARD' | 'URGENT' | 'FLEXIBLE'
  daysAgo: number
}

const LEAD_POSTCODES: Record<string, string> = {
  Liverpool: '2170',
  Prestons: '2170',
  Casula: '2170',
  Moorebank: '2170',
  Bankstown: '2200',
  Fairfield: '2165',
}

export const SEED_LEADS: SeedLead[] = seed.jobs.map((j, i) => ({
  reference: j.id,
  title: j.title,
  suburb: j.suburb,
  postcode: LEAD_POSTCODES[j.suburb] ?? '2170',
  state: 'NSW',
  status: j.status as SeedLead['status'],
  budgetAUD: j.budgetAUD,
  description: `${j.description}.`,
  category: /gate/i.test(j.title) ? 'Gates' : /shutter/i.test(j.title) ? 'Shutters' : /motor/i.test(j.title) ? 'Openers & motors' : 'Garage doors',
  urgency: i % 3 === 0 ? 'URGENT' : 'STANDARD',
  daysAgo: 1 + i * 2,
}))

export interface SeedManual {
  id: string
  slug: string
  brand: string
  model: string
  type: string
  title: string
  kind: string
  pages: number
  year: number
}

export const SEED_MANUALS: SeedManual[] = seed.manuals.map((m, i) => ({
  id: m.id,
  slug: `${m.brand}-${m.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  brand: m.brand,
  model: m.model,
  type: m.type,
  title: `${m.brand} ${m.model} ${['installation manual', 'owner’s guide', 'programming guide', 'service manual', 'installation manual', 'user guide'][i]}`,
  kind: ['Installation', 'User', 'Programming', 'Service', 'Installation', 'User'][i],
  pages: [28, 16, 12, 40, 24, 8][i],
  year: 2021 + (i % 4),
}))

export interface SeedListing {
  id: string
  title: string
  category: string
  brand: string
  model: string
  condition: 'NEW' | 'USED_LIKE_NEW' | 'USED_GOOD' | 'REFURBISHED'
  priceCents: number
  sellerCompanyId: string
  suburb: string
  description: string
  stock: number
}

export const SEED_LISTINGS: SeedListing[] = [
  ['Sectional garage door panel set, 2400 wide', 'Sectional garage doors', 'Westline', 'S240 Sectional', 'NEW', 189000, 'company_08'],
  ['Roller door curtain, 2400 × 2100', 'Roller doors', 'Summit Entry', 'R220 Roller', 'NEW', 98000, 'company_02'],
  ['Tilt door counterbalance kit', 'Tilt doors', 'MetroSpan', 'MT-450 Tilt', 'NEW', 34500, 'company_04'],
  ['Sliding gate motor, 600 kg', 'Openers & motors', 'Bluegum', 'BG-600 SmartDrive', 'NEW', 112000, 'company_03'],
  ['Swing gate ram kit (pair)', 'Openers & motors', 'Bluegum', 'BG-RAM 400', 'NEW', 139000, 'company_03'],
  ['4-button rolling-code remote', 'Remotes & accessories', 'Westline', 'RF4 Handset', 'NEW', 6900, 'company_01'],
  ['Wireless wall keypad', 'Remotes & accessories', 'Bluegum', 'BG-KP2', 'NEW', 12900, 'company_03'],
  ['Torsion spring pair, 218 × 6.0 mm', 'Springs & hardware', 'Crestview', 'CV-TS218', 'NEW', 24500, 'company_08'],
  ['Photo-electric safety beams', 'Safety sensors', 'Bluegum', 'BG-Beam', 'NEW', 15900, 'company_03'],
  ['Sliding gate track, 6 m galvanised', 'Sliding gates', 'Crestview', 'CV-900 Slide', 'NEW', 38900, 'company_08'],
  ['Window roller shutter, 1800 × 1500', 'Roller shutters', 'Crestview', 'CV-WS39', 'NEW', 84000, 'company_07'],
  ['Shop roller shutter motor, 120 Nm', 'Openers & motors', 'Bluegum', 'BG-T120', 'NEW', 64000, 'company_03'],
  ['Sectional door opener, belt drive', 'Openers & motors', 'Westline', 'W-800B', 'NEW', 54900, 'company_01'],
  ['Battery backup module', 'Remotes & accessories', 'Bluegum', 'BG-BB24', 'NEW', 19900, 'company_03'],
  ['Ex-display sectional door, charcoal', 'Sectional garage doors', 'Westline', 'S240 Sectional', 'USED_LIKE_NEW', 129000, 'company_01'],
  ['Roller door motor (used, tested)', 'Openers & motors', 'Summit Entry', 'SE-RM700', 'USED_GOOD', 21000, 'company_02'],
  ['Swing gate leaf, aluminium slat 1800', 'Swing gates', 'Crestview', 'CV-SG18', 'NEW', 76000, 'company_06'],
  ['Pedestrian gate kit with closer', 'Swing gates', 'Crestview', 'CV-PG10', 'NEW', 42000, 'company_06'],
  ['Garage door rollers, nylon (set of 10)', 'Springs & hardware', 'MetroSpan', 'MS-R10', 'NEW', 8900, 'company_04'],
  ['Refurbished tilt door, 2400 wide', 'Tilt doors', 'MetroSpan', 'MT-450 Tilt', 'REFURBISHED', 89000, 'company_04'],
  ['Smart Wi-Fi controller for openers', 'Remotes & accessories', 'Bluegum', 'BG-Link', 'NEW', 17900, 'company_03'],
  ['Shop shutter curtain, 3600 wide', 'Roller shutters', 'Crestview', 'CV-SS77', 'NEW', 248000, 'company_05'],
  ['Weather seal kit, sectional door', 'Springs & hardware', 'Westline', 'S-WS24', 'NEW', 7900, 'company_01'],
  ['Extension spring pair (heavy)', 'Springs & hardware', 'Summit Entry', 'SE-EX90', 'NEW', 11900, 'company_02'],
].map(([title, category, brand, model, condition, priceCents, sellerCompanyId], i) => {
  const seller = COMPANIES.find((c) => c.id === sellerCompanyId)!
  return {
    id: `LST-${3100 + i}`,
    title: title as string,
    category: category as string,
    brand: brand as string,
    model: model as string,
    condition: condition as SeedListing['condition'],
    priceCents: priceCents as number,
    sellerCompanyId: sellerCompanyId as string,
    suburb: seller.suburb,
    description: `${title}. Fictional demo listing from ${seller.name}. Pick-up or delivery arranged with the seller.`,
    stock: 1 + ((i * 7) % 9),
  }
})

/** Motors the designer can shortlist. Fictional models from the demo brands. */
export const SEED_MOTORS: MotorCandidate[] = [
  { id: 'm1', slug: 'bluegum-bg-600', manufacturer: 'Bluegum', manufacturerSlug: 'bluegum', modelCode: 'BG-600', name: 'BG-600 SmartDrive', operator: 'sliding', supply: '24 V DC', maxGateKg: 600, maxGateLengthM: 10 },
  { id: 'm2', slug: 'bluegum-bg-1000', manufacturer: 'Bluegum', manufacturerSlug: 'bluegum', modelCode: 'BG-1000', name: 'BG-1000 Heavy Slide', operator: 'sliding', supply: '230 V AC', maxGateKg: 1000, maxGateLengthM: 14 },
  { id: 'm3', slug: 'crestview-cv-400', manufacturer: 'Crestview', manufacturerSlug: 'crestview', modelCode: 'CV-400', name: 'CV-400 Slide', operator: 'sliding', supply: '24 V DC', maxGateKg: 400, maxGateLengthM: 7 },
  { id: 'm4', slug: 'bluegum-bg-ram-400', manufacturer: 'Bluegum', manufacturerSlug: 'bluegum', modelCode: 'BG-RAM 400', name: 'BG-RAM 400', operator: 'swing-ram', supply: '24 V DC', maxLeafKg: 300, maxLeafLengthM: 3 },
  { id: 'm5', slug: 'summit-se-arm', manufacturer: 'Summit Entry', manufacturerSlug: 'summit-entry', modelCode: 'SE-ARM', name: 'SE-ARM Articulated', operator: 'swing-arm', supply: '24 V DC', maxLeafKg: 250, maxLeafLengthM: 2.5 },
  { id: 'm6', slug: 'crestview-cv-ug', manufacturer: 'Crestview', manufacturerSlug: 'crestview', modelCode: 'CV-UG', name: 'CV-UG Underground', operator: 'swing-underground', supply: '230 V AC', maxLeafKg: 400, maxLeafLengthM: 3.5 },
  { id: 'm7', slug: 'bluegum-bg-t20', manufacturer: 'Bluegum', manufacturerSlug: 'bluegum', modelCode: 'BG-T20', name: 'BG-T20 Tubular', operator: 'tubular', supply: '230 V AC', torqueOptionsNm: [10, 20, 30, 50], liftingKg: 40 },
]

export const SEED_JOB_COMPANY = 'company_01'
