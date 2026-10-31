import type { PricedProductId } from './engine'

/**
 * Optional accessories a customer can ask for. A business prices the ones
 * it supplies; one it hasn't priced is shown as "not priced", never given
 * a made-up figure.
 */
export const ACCESSORIES = [
  { id: 'extra-remote', label: 'Extra remote' },
  { id: 'wall-keypad', label: 'Wireless keypad' },
  { id: 'safety-beams', label: 'Safety beams' },
  { id: 'battery-backup', label: 'Battery backup' },
  { id: 'smart-control', label: 'Smartphone control' },
] as const

export type AccessoryId = (typeof ACCESSORIES)[number]['id']

const MOTORISED: PricedProductId[] = [
  'GARAGE_DOOR',
  'SLIDING_GATE',
  'SWING_GATE',
  'PEDESTRIAN_GATE',
  'WINDOW_SHUTTER',
  'SHOP_SHUTTER',
]

/** Accessories only make sense on something with a motor. */
export function accessoriesFor(product: PricedProductId, motorRequired: boolean) {
  return MOTORISED.includes(product) && motorRequired ? ACCESSORIES : []
}

export function isAccessoryId(value: string): value is AccessoryId {
  return ACCESSORIES.some((a) => a.id === value)
}

export function accessoryLabel(id: string): string {
  return ACCESSORIES.find((a) => a.id === id)?.label ?? id
}
