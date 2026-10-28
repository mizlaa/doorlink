import type { DoorKind, DoorLook } from '@/components/three/GarageDoorScene'
import type { GateInfill, GateKind, GateLook, SwingMotorStyle } from '@/components/three/GateScene'
import { colourHex, DEFAULT_SPEC, familyOf, hardwareHex, isMotorised, type DoorSpec } from './options'

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

export function doorSizeScales(widthMm: number, heightMm: number): { widthScale: number; heightScale: number } {
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
  // Only garage types reach the garage scene; anything else draws as a
  // sectional here so the type stays honest for callers that ask anyway.
  const kind: DoorKind = familyOf(spec.productType) === 'garage' ? (spec.productType as DoorKind) : 'sectional'

  const panelCount = kind === 'sectional' ? Number(spec.panelCount) || 4 : 1

  return {
    kind,
    finish: spec.finish,
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

const GATE_KIND: Record<string, GateKind> = {
  'sliding-gate': 'sliding',
  'swing-gate': 'swing',
  'pedestrian-gate': 'pedestrian',
  fence: 'fence',
  'window-shutter': 'shutter',
}

/**
 * Gates, fences and shutters are drawn at their real size, so unlike a
 * garage door the look carries metres rather than a scale.
 */
export function gateLookFromSpec(spec: DoorSpec): GateLook {
  const material = FINISH_MATERIAL[spec.finish] ?? FINISH_MATERIAL.satin
  return {
    kind: GATE_KIND[spec.productType] ?? 'swing',
    widthM: spec.widthMm / 1000,
    heightM: spec.heightMm / 1000,
    color: colourHex(spec.colour),
    hardwareColor: hardwareHex(spec.hardware),
    finish: spec.finish,
    // Powder-coated metal reads a touch more metallic than a painted door.
    roughness: material.roughness,
    metalness: Math.min(0.45, material.metalness + 0.08),
    infill: (['slats', 'spaced-slats', 'pickets', 'solid'].includes(spec.infill)
      ? spec.infill
      : 'slats') as GateInfill,
    leaves: spec.leaves === '1' ? 1 : 2,
    swingMotor: (['ram', 'arm', 'underground'].includes(spec.swingMotor)
      ? spec.swingMotor
      : 'ram') as SwingMotorStyle,
    motorised: isMotorised(spec),
    slatM: spec.slat === '55' ? 0.055 : 0.039,
  }
}

export type Preview = { scene: 'garage'; look: DoorLook } | { scene: 'gate'; look: GateLook }

export function previewFromSpec(spec: DoorSpec): Preview {
  return familyOf(spec.productType) === 'garage'
    ? { scene: 'garage', look: lookFromSpec(spec) }
    : { scene: 'gate', look: gateLookFromSpec(spec) }
}
