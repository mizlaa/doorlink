import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isDemo } from './mode'

/**
 * Bundled sample images for demo mode, in public/demo/. Every image a
 * person "uploads" in the demo is replaced by one of these, so nothing is
 * stored and nothing is written to Supabase. Filled by scripts/demo/build-assets.mjs.
 */
export const DEMO_SAMPLES = {
  logos: [
    'demo/logos/harbourline-doors.svg',
    'demo/logos/parramatta-gate-works.svg',
    'demo/logos/westbrook-roller-co.svg',
    'demo/logos/ridgeline-shutter-studio.svg',
    'demo/logos/blue-mountain-automation.svg',
    'demo/logos/coastal-crest-garage-doors.svg',
    'demo/logos/kingsford-gate-and-fence.svg',
  ],
  portfolio: [
    'demo/portfolio/sectional-timber-look.svg',
    'demo/portfolio/sectional-charcoal.svg',
    'demo/portfolio/sliding-gate-slat.svg',
    'demo/portfolio/swing-gate-steel.svg',
    'demo/portfolio/pedestrian-gate-aluminium.svg',
    'demo/portfolio/window-shutter-plantation.svg',
    'demo/portfolio/window-shutter-roller.svg',
    'demo/portfolio/shop-shutter-roller.svg',
    'demo/portfolio/fence-slat-privacy.svg',
  ],
  reviews: ['demo/reviews/review-photo-1.svg', 'demo/reviews/review-photo-2.svg'],
  jobs: [
    'demo/jobs/progress-1.svg',
    'demo/jobs/progress-2.svg',
    'demo/jobs/progress-3.svg',
    'demo/jobs/progress-4.svg',
  ],
  ai: ['demo/ai/design-1.png', 'demo/ai/design-2.png', 'demo/ai/design-3.png', 'demo/ai/design-4.png'],
} as const

export type DemoSamplePrefix = keyof typeof DEMO_SAMPLES

/** A bundled sample for an upload under this prefix. Demo only. */
export function demoSampleKey(prefix: DemoSamplePrefix): string {
  const list = DEMO_SAMPLES[prefix]
  return list[Math.floor(Math.random() * list.length)]
}

/** Bytes of a bundled sample, for code that expects image data (the AI provider stand-in). */
export function demoSampleBase64(key: string): string {
  if (!isDemo()) throw new Error('Demo samples are only read in demo mode')
  return readFileSync(path.join(process.cwd(), 'public', key)).toString('base64')
}
