import type { DoorLook } from '@/components/three/GarageDoorScene'
import { colourHex, DEFAULT_SPEC, hardwareHex, type DoorSpec } from './options'

/**
 * Turns a saved spec into the handful of numbers the 3D scene needs.
 *
 * Kept separate from both so the option vocabulary can grow without the
 * renderer knowing, and the renderer can change without the option list
 * caring. Finishes map to roughness/metalness because that is the only
 * honest way to show "gloss" versus "matte" — not a different colour.
 */
const FINISH_MATERIAL: Record<string, { roughness: number; metalness: number }> = {
  matte: { roughness: 0.82, metalness: 0.04 },
  satin: { roughness: 0.55, metalness: 0.16 },
  gloss: { roughness: 0.18, metalness: 0.3 },
  woodgrain: { roughness: 0.74, metalness: 0.02 },
}

const WIDTH_SCALE_MIN = 0.85
const WIDTH_SCALE_MAX = 1.45
const HEIGHT_SCALE_MIN = 0.9
const HEIGHT_SCALE_MAX = 1.25

export function doorSizeScales(
  widthMm: number,
  heightMm: number
): { widthScale: number; heightScale: number } {
  const widthScale = widthMm / DEFAULT_SPEC.widthMm
  const heightScale = heightMm / DEFAULT_SPEC.heightMm
  return {
    widthScale: Math.min(WIDTH_SCALE_MAX, Math.max(WIDTH_SCALE_MIN, widthScale)),
    heightScale: Math.min(HEIGHT_SCALE_MAX, Math.max(HEIGHT_SCALE_MIN, heightScale)),
  }
}

export function lookFromSpec(spec: DoorSpec): DoorLook {
  const material = FINISH_MATERIAL[spec.finish] ?? FINISH_MATERIAL.satin
  const { widthScale, heightScale } = doorSizeScales(spec.widthMm, spec.heightMm)
  const kind = spec.productType

  const panelCount = kind === 'sectional' ? Number(spec.panelCount) || 4 : 1

  return {
    kind,
    widthScale,
    heightScale,
    color: colourHex(spec.colour),
    hardwareColor: hardwareHex(spec.hardware),
    panelCount,
    profile: kind === 'roller' ? 'ribbed' : spec.panelProfile,
    windows: kind === 'roller' ? 'none' : spec.windows,
    roughness: material.roughness,
    metalness: material.metalness,
  }
}
