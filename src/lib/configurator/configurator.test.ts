import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPEC,
  describeSpec,
  groupsFor,
  OPTION_GROUPS,
  parseSpec,
  SIZE_LIMITS,
  specAsBrief,
} from './options'
import { doorSizeScales, lookFromSpec } from './look'

describe('parseSpec', () => {
  it('returns the default for junk rather than trusting it', () => {
    expect(parseSpec(null)).toEqual(DEFAULT_SPEC)
    expect(parseSpec('not an object')).toEqual(DEFAULT_SPEC)
    expect(parseSpec({ colour: 'a colour that does not exist' }).colour).toBe(DEFAULT_SPEC.colour)
  })

  it('keeps a stored configuration working when an option is retired', () => {
    // The scenario this exists for: someone saves a door in 2026, the
    // "sand" colour is dropped in 2027, and their saved configuration
    // still has to open rather than crash the page.
    const stored = { ...DEFAULT_SPEC, colour: 'retired-colour', finish: 'retired-finish' }
    const parsed = parseSpec(stored)
    expect(parsed.colour).toBe(DEFAULT_SPEC.colour)
    expect(parsed.finish).toBe(DEFAULT_SPEC.finish)
    expect(parsed.productType).toBe(stored.productType)
  })

  it('clamps sizes into the range the form allows', () => {
    expect(parseSpec({ widthMm: 50 }).widthMm).toBe(SIZE_LIMITS.widthMm.min)
    expect(parseSpec({ widthMm: 999_999 }).widthMm).toBe(SIZE_LIMITS.widthMm.max)
    expect(parseSpec({ heightMm: '2200' }).heightMm).toBe(2200)
    expect(parseSpec({ heightMm: 'tall' }).heightMm).toBe(DEFAULT_SPEC.heightMm)
  })

  it('round-trips a spec it produced', () => {
    const spec = parseSpec({ ...DEFAULT_SPEC, colour: 'sand', finish: 'gloss', panelCount: '5' })
    expect(parseSpec(JSON.parse(JSON.stringify(spec)))).toEqual(spec)
  })
})

describe('groupsFor', () => {
  it('hides the groups that do not apply to a roller door', () => {
    const ids = groupsFor('roller').map((group) => group.id)
    expect(ids).not.toContain('panelCount')
    expect(ids).not.toContain('panelProfile')
    expect(ids).not.toContain('windows')
    expect(ids).toContain('colour')
  })

  it('shows sections only for a sectional door', () => {
    expect(groupsFor('sectional').map((g) => g.id)).toContain('panelCount')
    expect(groupsFor('tilt').map((g) => g.id)).not.toContain('panelCount')
  })
})

describe('describeSpec', () => {
  it('reads as something you could say to a technician', () => {
    const rows = describeSpec(DEFAULT_SPEC)
    const labels = rows.map((row) => row.label)
    expect(labels).toContain('Door type')
    expect(labels).toContain('Opening')
    expect(rows.find((row) => row.label === 'Opening')?.value).toBe('2400 × 2100 mm')
    // Every value is a human label, never a raw option id.
    for (const row of rows) expect(row.value).not.toMatch(/^[a-z-]+$/)
  })

  it('leaves out what does not apply', () => {
    const roller = describeSpec({ ...DEFAULT_SPEC, productType: 'roller' })
    expect(roller.map((row) => row.label)).not.toContain('Sections')
    expect(specAsBrief({ ...DEFAULT_SPEC, productType: 'roller' })).not.toContain('Sections')
  })
})

describe('lookFromSpec', () => {
  it('gives every option group a usable render', () => {
    for (const group of OPTION_GROUPS) {
      for (const value of group.values) {
        const spec = parseSpec({ ...DEFAULT_SPEC, [group.id]: value.id })
        const look = lookFromSpec(spec)
        expect(look.color).toMatch(/^#[0-9a-f]{6}$/i)
        expect(look.panelCount).toBeGreaterThan(0)
        expect(look.roughness).toBeGreaterThan(0)
      }
    }
  })

  it('maps product type to a door kind for the renderer', () => {
    expect(lookFromSpec(DEFAULT_SPEC).kind).toBe('sectional')
    expect(lookFromSpec({ ...DEFAULT_SPEC, productType: 'roller' }).kind).toBe('roller')
    expect(lookFromSpec({ ...DEFAULT_SPEC, productType: 'tilt' }).kind).toBe('tilt')
  })

  it('clamps opening size scales so the house stays in frame', () => {
    expect(lookFromSpec({ ...DEFAULT_SPEC, widthMm: 2400, heightMm: 2100 })).toMatchObject({
      widthScale: 1,
      heightScale: 1,
    })
    expect(lookFromSpec({ ...DEFAULT_SPEC, widthMm: 6000 }).widthScale).toBe(1.45)
    expect(lookFromSpec({ ...DEFAULT_SPEC, widthMm: 1800 }).widthScale).toBe(0.85)
    expect(doorSizeScales(3000, 3000).heightScale).toBe(1.25)
  })
})
