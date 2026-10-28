import type { MotorRequirement } from '@/lib/motors/specs'
import { familyOf, isMotorised, type DoorSpec } from './options'

/**
 * Planning estimates: how heavy the designed gate or shutter is, and so
 * what a motor has to be rated for.
 *
 * These are the figures installers use to shortlist before anyone weighs
 * anything, not measurements:
 *
 *  - aluminium slat gates run about 10–12 kg/m², tubular steel 15–25 and
 *    solid steel 40–50. The top of each range is used, so an estimate
 *    errs heavy and a motor picked from it errs strong.
 *  - aluminium shutter curtains run about 2.1–2.9 kg/m² in 39 mm slats and
 *    3.4–3.8 kg/m² in 55 mm, plus about 10% for the bottom rail; again the
 *    top of the range.
 *  - a tubular motor needs at least 1 Nm for every 2 kg of curtain.
 */
export const MATERIAL_KG_PER_M2: Record<string, number> = {
  aluminium: 12,
  'tubular-steel': 25,
  'solid-steel': 50,
}

export const SLAT_KG_PER_M2: Record<string, number> = {
  '39': 2.9,
  '55': 3.8,
}

const BOTTOM_RAIL_ALLOWANCE = 1.1
const KG_PER_NM = 2

export interface Estimate {
  /** The whole gate, or the whole shutter curtain. */
  totalKg: number
  /** Per swing leaf; equal to totalKg for anything with one leaf. */
  leafKg: number
  leafLengthM: number
  /** Tubular motors only. */
  torqueNm?: number
}

function areaM2(spec: DoorSpec): number {
  return (spec.widthMm / 1000) * (spec.heightMm / 1000)
}

export function estimateFor(spec: DoorSpec): Estimate | null {
  const family = familyOf(spec.productType)

  if (family === 'shutter') {
    const kgPerM2 = SLAT_KG_PER_M2[spec.slat] ?? SLAT_KG_PER_M2['39']
    const totalKg = areaM2(spec) * kgPerM2 * BOTTOM_RAIL_ALLOWANCE
    return { totalKg, leafKg: totalKg, leafLengthM: spec.widthMm / 1000, torqueNm: totalKg / KG_PER_NM }
  }

  if (family === 'gate') {
    const kgPerM2 = MATERIAL_KG_PER_M2[spec.material] ?? MATERIAL_KG_PER_M2.aluminium
    const totalKg = areaM2(spec) * kgPerM2
    const leaves = spec.productType === 'swing-gate' ? Number(spec.leaves) || 1 : 1
    return { totalKg, leafKg: totalKg / leaves, leafLengthM: spec.widthMm / 1000 / leaves }
  }

  return null
}

/** What a motor must be rated for, or null when nothing needs a motor. */
export function requirementFor(spec: DoorSpec): MotorRequirement | null {
  if (!isMotorised(spec)) return null
  const estimate = estimateFor(spec)
  if (!estimate) return null

  if (spec.productType === 'sliding-gate') {
    return { kind: 'sliding', gateKg: estimate.totalKg, gateLengthM: spec.widthMm / 1000 }
  }
  if (spec.productType === 'swing-gate' || spec.productType === 'pedestrian-gate') {
    const style = spec.swingMotor === 'arm' || spec.swingMotor === 'underground' ? spec.swingMotor : 'ram'
    return { kind: 'swing', style, leafKg: estimate.leafKg, leafLengthM: estimate.leafLengthM }
  }
  if (spec.productType === 'window-shutter') {
    return { kind: 'tubular', torqueNm: estimate.torqueNm ?? 0, curtainKg: estimate.totalKg }
  }
  return null
}

/** "about 260 kg" — rounded, because the inputs are estimates too. */
export function roughKg(kg: number): string {
  if (kg < 20) return `about ${Math.max(1, Math.round(kg))} kg`
  return `about ${Math.round(kg / 10) * 10} kg`
}
