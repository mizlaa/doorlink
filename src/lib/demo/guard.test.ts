import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertDemoDatabaseIfDemo, assertDemoDatabaseUrl, NotDemoDatabaseError } from './guard'

const base = 'postgresql://user:pw@localhost:5432'

describe('assertDemoDatabaseUrl', () => {
  it('accepts a database whose name says it is a demo', () => {
    expect(assertDemoDatabaseUrl(`${base}/doorlink_demo?schema=public`)).toBe('doorlink_demo')
    expect(assertDemoDatabaseUrl(`${base}/demo`)).toBe('demo')
    expect(assertDemoDatabaseUrl(`${base}/doorlink-demo`)).toBe('doorlink-demo')
  })

  it('refuses a database that does not say it is a demo', () => {
    expect(() => assertDemoDatabaseUrl(`${base}/doorlink?schema=public`)).toThrow(NotDemoDatabaseError)
    expect(() => assertDemoDatabaseUrl(`${base}/postgres`)).toThrow(/does not say it is a demo/)
  })

  it('refuses names that look like production, even if they also say demo', () => {
    expect(() => assertDemoDatabaseUrl(`${base}/doorlink_prod_demo`)).toThrow(/looks like production/)
    expect(() => assertDemoDatabaseUrl(`${base}/doorlink_production`)).toThrow(NotDemoDatabaseError)
    expect(() => assertDemoDatabaseUrl(`${base}/doorlink_live`)).toThrow(NotDemoDatabaseError)
  })

  it('refuses a missing or unparseable URL', () => {
    expect(() => assertDemoDatabaseUrl(undefined)).toThrow(/DATABASE_URL is not set/)
    expect(() => assertDemoDatabaseUrl('postgresql://user@localhost:5432/')).toThrow(NotDemoDatabaseError)
  })

  it('does not treat "demo" inside another word as a demo name', () => {
    expect(() => assertDemoDatabaseUrl(`${base}/demolition`)).toThrow(NotDemoDatabaseError)
  })
})

describe('assertDemoDatabaseIfDemo', () => {
  const original = { ...process.env }
  beforeEach(() => {
    vi.stubEnv('DOORLINK_DEMO', 'true')
  })
  afterEach(() => {
    process.env = { ...original }
    vi.unstubAllEnvs()
  })

  it('throws in demo mode when the database is not a demo database', () => {
    expect(() => assertDemoDatabaseIfDemo(`${base}/doorlink`)).toThrow(NotDemoDatabaseError)
  })

  it('passes in demo mode for a demo database', () => {
    expect(() => assertDemoDatabaseIfDemo(`${base}/doorlink_demo`)).not.toThrow()
  })

  it('does nothing when demo mode is off, so the real product is unchanged', () => {
    vi.stubEnv('DOORLINK_DEMO', 'false')
    expect(() => assertDemoDatabaseIfDemo(`${base}/doorlink`)).not.toThrow()
    vi.stubEnv('DOORLINK_DEMO', '')
    expect(() => assertDemoDatabaseIfDemo(`${base}/doorlink`)).not.toThrow()
  })
})
