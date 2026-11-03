import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_BANNER_TEXT, devSessionAllowed, isDemo } from './mode'
import { demoBanner } from './banner'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('demo switch', () => {
  it('is on only for the exact value true', () => {
    vi.stubEnv('DOORLINK_DEMO', 'true')
    expect(isDemo()).toBe(true)
    for (const value of ['', 'false', 'TRUE', '1', 'yes']) {
      vi.stubEnv('DOORLINK_DEMO', value)
      expect(isDemo()).toBe(false)
    }
    vi.stubEnv('DOORLINK_DEMO', undefined)
    expect(isDemo()).toBe(false)
  })

  it('keeps the dev session off in production unless demo mode is on', () => {
    vi.stubEnv('DOORLINK_DEMO', 'false')
    vi.stubEnv('NODE_ENV', 'production')
    expect(devSessionAllowed()).toBe(false)
    vi.stubEnv('DOORLINK_DEMO', 'true')
    expect(devSessionAllowed()).toBe(true)
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DOORLINK_DEMO', 'false')
    expect(devSessionAllowed()).toBe(true)
  })
})

describe('demo banner', () => {
  it('shows the required wording and a link to the tour when demo mode is on', () => {
    vi.stubEnv('DOORLINK_DEMO', 'true')
    expect(demoBanner()).toEqual({ text: 'DEMO. No real businesses, prices, reviews or payments.', tourHref: '/demo' })
    expect(DEMO_BANNER_TEXT).toBe('DEMO. No real businesses, prices, reviews or payments.')
  })

  it('is absent when demo mode is off', () => {
    vi.stubEnv('DOORLINK_DEMO', 'false')
    expect(demoBanner()).toBeNull()
  })
})
