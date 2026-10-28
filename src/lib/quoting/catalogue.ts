/**
 * The product categories and motor brands the automated quoting system
 * knows about. Plain data with no prices: every price comes from a
 * participating business's own rules.
 *
 * Motor brands are the lists the client supplied for gates and window
 * shutters. Doorlink holds no verified compatibility data for them, so
 * nothing here claims a motor suits a gate. A business only quotes a
 * motor it has priced for that product and size.
 */
import type { QuoteProductCategory } from '@prisma/client'

export const GATE_MOTOR_BRANDS = ['Beninca', 'BFT', 'FAAC', 'Merlin', 'Grifo', 'Nice V8'] as const
export const WINDOW_SHUTTER_MOTOR_BRANDS = ['CWB', 'Maximum', 'Somfy', 'Simu', 'Nice'] as const

/**
 * How motors work for a category:
 *  - `list`: the motor brand must come from `motorBrands`
 *  - `open`: a business may name any motor brand, or none
 *  - `none`: the product has no motor
 */
export type MotorPolicy = 'list' | 'open' | 'none'

export interface CategoryInfo {
  id: QuoteProductCategory
  label: string
  plural: string
  description: string
  widthLabel: string
  heightLabel: string
  motorPolicy: MotorPolicy
  motorBrands: readonly string[]
  /** Brands the client named as examples. Suggestions only, never a closed list. */
  brandExamples: readonly string[]
  /** URL-friendly id for links such as /quote?category=sliding-gate. */
  slug: string
}

export const CATEGORIES: readonly CategoryInfo[] = [
  {
    id: 'GARAGE_DOOR',
    slug: 'garage-door',
    label: 'Garage door',
    plural: 'Garage doors',
    description: 'Sectional, roller and tilt doors.',
    widthLabel: 'Opening width',
    heightLabel: 'Opening height',
    motorPolicy: 'open',
    motorBrands: [],
    brandExamples: ['DoorWorks', 'Gliderol'],
  },
  {
    id: 'SLIDING_GATE',
    slug: 'sliding-gate',
    label: 'Sliding gate',
    plural: 'Sliding gates',
    description: 'A gate that slides across the opening on a track.',
    widthLabel: 'Opening width',
    heightLabel: 'Gate height',
    motorPolicy: 'list',
    motorBrands: GATE_MOTOR_BRANDS,
    brandExamples: [],
  },
  {
    id: 'SWING_GATE',
    slug: 'swing-gate',
    label: 'Swing gate',
    plural: 'Swing gates',
    description: 'Single or double leaves that swing open on hinges.',
    widthLabel: 'Opening width',
    heightLabel: 'Gate height',
    motorPolicy: 'list',
    motorBrands: GATE_MOTOR_BRANDS,
    brandExamples: [],
  },
  {
    id: 'PEDESTRIAN_GATE',
    slug: 'pedestrian-gate',
    label: 'Pedestrian gate',
    plural: 'Pedestrian gates',
    description: 'A walk-through gate.',
    widthLabel: 'Opening width',
    heightLabel: 'Gate height',
    motorPolicy: 'list',
    motorBrands: GATE_MOTOR_BRANDS,
    brandExamples: [],
  },
  {
    id: 'FENCE',
    slug: 'fence',
    label: 'Fence',
    plural: 'Fences',
    description: 'A run of fencing.',
    widthLabel: 'Length of fence',
    heightLabel: 'Fence height',
    motorPolicy: 'none',
    motorBrands: [],
    brandExamples: [],
  },
  {
    id: 'WINDOW_SHUTTER',
    slug: 'window-shutter',
    label: 'Window shutter',
    plural: 'Window shutters',
    description: 'A roller shutter over a window.',
    widthLabel: 'Window width',
    heightLabel: 'Window height',
    motorPolicy: 'list',
    motorBrands: WINDOW_SHUTTER_MOTOR_BRANDS,
    brandExamples: [],
  },
  {
    id: 'SHOP_SHUTTER',
    slug: 'shop-shutter',
    label: 'Shop shutter',
    plural: 'Shop shutters',
    description: 'A roller shutter for a shopfront or commercial opening.',
    widthLabel: 'Opening width',
    heightLabel: 'Opening height',
    motorPolicy: 'open',
    motorBrands: [],
    brandExamples: [],
  },
]

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as QuoteProductCategory[]

export function categoryInfo(id: QuoteProductCategory): CategoryInfo {
  const found = CATEGORIES.find((c) => c.id === id)
  if (!found) throw new Error(`Unknown product category ${id}`)
  return found
}

export function categoryFromSlug(slug: string | undefined | null): CategoryInfo | null {
  return CATEGORIES.find((c) => c.slug === slug || c.id === slug) ?? null
}

/** Case and spacing insensitive key for comparing brand names. "" means none given. */
export function brandKey(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The canonical spelling of a listed motor brand, or null when it is not on the category's list. */
export function listedMotorBrand(category: QuoteProductCategory, value: string): string | null {
  const key = brandKey(value)
  return categoryInfo(category).motorBrands.find((brand) => brandKey(brand) === key) ?? null
}
