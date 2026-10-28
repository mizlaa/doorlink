import { familyOf, isMotorised, OPTION_GROUPS, type DoorSpec } from '@/lib/configurator/options'
import type { GstTreatmentId, InstallationTermsId, PricedProductId, QuoteRequest } from './engine'

/**
 * The vocabulary shared by the pricing area and the quote flow: product
 * names, the motor brands each product offers, and how a design from the
 * configurator becomes a quote request.
 */

export const PRICED_PRODUCTS: Array<{ id: PricedProductId; label: string }> = [
  { id: 'GARAGE_DOOR', label: 'Garage door' },
  { id: 'SLIDING_GATE', label: 'Sliding gate' },
  { id: 'SWING_GATE', label: 'Swing gate' },
  { id: 'PEDESTRIAN_GATE', label: 'Pedestrian gate' },
  { id: 'FENCE', label: 'Fence' },
  { id: 'WINDOW_SHUTTER', label: 'Window shutter' },
  { id: 'SHOP_SHUTTER', label: 'Shop shutter' },
]

export function productLabel(product: PricedProductId): string {
  return PRICED_PRODUCTS.find((p) => p.id === product)?.label ?? product
}

/** Garage door styles a rule may be limited to. */
export const GARAGE_STYLES: Array<{ id: string; label: string }> = [
  { id: 'sectional', label: 'Sectional' },
  { id: 'roller', label: 'Roller' },
  { id: 'tilt', label: 'Tilt' },
]

export function styleLabel(style: string | null): string | null {
  return style ? (GARAGE_STYLES.find((s) => s.id === style)?.label ?? style) : null
}

export const GST_LABELS: Record<GstTreatmentId, string> = {
  INCLUSIVE: 'Price includes GST',
  EXCLUSIVE: 'Price plus GST',
}

export const INSTALLATION_LABELS: Record<InstallationTermsId, string> = {
  INCLUDED: 'Installation included',
  SEPARATE: 'Installation priced separately',
  NOT_INCLUDED: 'Supply only (no installation)',
}

const GATE_PRODUCTS: PricedProductId[] = ['SLIDING_GATE', 'SWING_GATE', 'PEDESTRIAN_GATE']

/**
 * The motor brands a customer can ask for, per product — read from the
 * designer's own list so the two can never disagree. Garage doors and
 * shop shutters have no brand list (the client named none), so a
 * business may describe its motor in words but a customer does not pick
 * one; fences have no motor.
 */
export function motorBrandsFor(product: PricedProductId): Array<{ id: string; label: string }> {
  const group = OPTION_GROUPS.find((g) => g.id === 'motorBrand')
  if (!group) return []
  const designerType = GATE_PRODUCTS.includes(product)
    ? 'sliding-gate'
    : product === 'WINDOW_SHUTTER'
      ? 'window-shutter'
      : null
  if (!designerType) return []
  return group.values
    .filter((value) => value.id !== 'any' && (!value.only || value.only.includes(designerType)))
    .map((value) => ({ id: value.id, label: value.label }))
}

export function productHasMotor(product: PricedProductId): boolean {
  return product !== 'FENCE'
}

/** Whether a rule's motor is chosen from a fixed brand list (else free text). */
export function motorBrandIsListed(product: PricedProductId): boolean {
  return motorBrandsFor(product).length > 0
}

export function motorLabel(product: PricedProductId, motorBrand: string | null): string | null {
  if (!motorBrand) return null
  return motorBrandsFor(product).find((b) => b.id === motorBrand)?.label ?? motorBrand
}

const PRODUCT_FOR_TYPE: Record<DoorSpec['productType'], PricedProductId> = {
  sectional: 'GARAGE_DOOR',
  roller: 'GARAGE_DOOR',
  tilt: 'GARAGE_DOOR',
  'sliding-gate': 'SLIDING_GATE',
  'swing-gate': 'SWING_GATE',
  'pedestrian-gate': 'PEDESTRIAN_GATE',
  fence: 'FENCE',
  'window-shutter': 'WINDOW_SHUTTER',
  'shop-shutter': 'SHOP_SHUTTER',
}

export function productForSpec(spec: DoorSpec): { product: PricedProductId; productStyle: string | null } {
  return {
    product: PRODUCT_FOR_TYPE[spec.productType],
    productStyle: familyOf(spec.productType) === 'garage' ? spec.productType : null,
  }
}

/** Whether the design needs a motor: a garage opener, a motorised gate or shutter. */
export function specNeedsMotor(spec: DoorSpec): boolean {
  if (familyOf(spec.productType) === 'garage') return spec.opener !== 'none'
  return isMotorised(spec)
}

/**
 * The quote request a design makes. Brand preference and installation
 * are asked on the quote page, not in the designer.
 */
export function requestFromSpec(
  spec: DoorSpec,
  choices: { brand: string | null; installRequired: boolean }
): QuoteRequest {
  const { product, productStyle } = productForSpec(spec)
  const motorRequired = specNeedsMotor(spec)
  const listed = motorBrandsFor(product).some((b) => b.id === spec.motorBrand)
  return {
    product,
    productStyle,
    widthMm: spec.widthMm,
    heightMm: spec.heightMm,
    brand: choices.brand,
    motorRequired,
    motorBrand: motorRequired && listed ? spec.motorBrand : null,
    installRequired: choices.installRequired,
  }
}
