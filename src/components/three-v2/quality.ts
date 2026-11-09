/**
 * Adaptive graphics quality. A starting tier from what the device says
 * about itself, then the scene's PerformanceMonitor steps it down if the
 * frame rate sags (and back up when there is headroom).
 */
export type Tier = 'high' | 'medium' | 'low'

export interface TierSettings {
  dpr: [number, number]
  shadowMapSize: number
  ambientOcclusion: boolean
  aoHalfRes: boolean
  multisampling: number
  foliageShadows: boolean
  grassTufts: number
  wind: boolean
}

export const TIERS: Record<Tier, TierSettings> = {
  // Sharpness first: device pixel ratio up to 2 and 4x MSAA on every tier
  // (cheap on mobile tile GPUs); the tiers trade shadows, AO and foliage.
  high: { dpr: [1.25, 2], shadowMapSize: 4096, ambientOcclusion: true, aoHalfRes: false, multisampling: 4, foliageShadows: true, grassTufts: 520, wind: true },
  medium: { dpr: [1, 2], shadowMapSize: 2048, ambientOcclusion: true, aoHalfRes: true, multisampling: 4, foliageShadows: true, grassTufts: 300, wind: true },
  low: { dpr: [1, 1.5], shadowMapSize: 1536, ambientOcclusion: false, aoHalfRes: true, multisampling: 4, foliageShadows: false, grassTufts: 140, wind: true },
}

export function detectTier(): Tier {
  if (typeof navigator === 'undefined') return 'medium'
  const ua = navigator.userAgent
  const touch = /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  if (!touch && cores >= 8 && memory >= 8) return 'high'
  // Phones and tablets: the light tier (no AO, depth of field or foliage shadows) keeps it smooth.
  if (touch) return 'low'
  return 'medium'
}

export function stepDown(tier: Tier): Tier {
  return tier === 'high' ? 'medium' : 'low'
}

export function stepUp(tier: Tier, ceiling: Tier): Tier {
  if (tier === 'low') return ceiling === 'low' ? 'low' : 'medium'
  if (tier === 'medium') return ceiling === 'high' ? 'high' : 'medium'
  return 'high'
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
