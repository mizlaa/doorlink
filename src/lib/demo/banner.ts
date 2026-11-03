import { DEMO_BANNER_TEXT, isDemo } from './mode'

/**
 * What the demo banner says, or null when it should not show. The
 * component (components/layout/DemoBanner.tsx) only lays this out, so the
 * rule "shown on every page in demo mode, nowhere else" is testable here.
 */
export function demoBanner(): { text: string; tourHref: string } | null {
  if (!isDemo()) return null
  return { text: DEMO_BANNER_TEXT, tourHref: '/demo' }
}
