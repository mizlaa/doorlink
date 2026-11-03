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
  high: { dpr: [1, 2], shadowMapSize: 2048, ambientOcclusion: true, aoHalfRes: false, multisampling: 4, foliageShadows: true, grassTufts: 520, wind: true },
  medium: { dpr: [1, 1.6], shadowMapSize: 2048, ambientOcclusion: true, aoHalfRes: true, multisampling: 0, foliageShadows: true, grassTufts: 300, wind: true },
  low: { dpr: [0.85, 1.25], shadowMapSize: 1024, ambientOcclusion: false, aoHalfRes: true, multisampling: 0, foliageShadows: false, grassTufts: 140, wind: true },
}

export function detectTier(): Tier {
  if (typeof navigator === 'undefined') return 'medium'
  const ua = navigator.userAgent
  const touch = /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  if (!touch && cores >= 8 && memory >= 8) return 'high'
  if (touch && (memory <= 2 || cores <= 2)) return 'low'
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
