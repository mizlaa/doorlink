import { describe, expect, it } from 'vitest'
import { SAME_MANUFACTURER, isIndex, isPdf, keepsRow } from './list-policy'

describe('isPdf', () => {
  it('judges the path, not the query string', () => {
    expect(isPdf('https://example.com/manual.pdf')).toBe(true)
    expect(isPdf('https://example.com/MANUAL.PDF')).toBe(true)
    expect(isPdf('https://example.com/manual.pdf?sfvrsn=347fa23c_4')).toBe(true)
    expect(isPdf('https://example.com/manual.pdf#page=3')).toBe(true)
    // A PDF named in the query is still a page that serves something else.
    expect(isPdf('https://example.com/download.php?file=manual.pdf')).toBe(false)
  })

  it('rejects the viewer pages aggregators serve in place of the file', () => {
    expect(isPdf('https://www.manualslib.com/manual/1507777/Grifco-Edrive-2-0-M123ed2.html')).toBe(false)
    expect(isPdf('https://manuals.plus/m/430a1144fac93c3caf1c9e52ca5fbcb7')).toBe(false)
    expect(isPdf('https://www.scribd.com/document/574783176/FAAC-740-741-Gate-Motor-Manual')).toBe(false)
  })
})

describe('isIndex', () => {
  it('catches a page that lists manuals rather than being one', () => {
    expect(isIndex('Gliderol User Manuals and Install Guides Index')).toBe(true)
    expect(isIndex('Merlin Installation Manuals Index (National Garage)')).toBe(true)
  })

  it('does not catch the word inside another one', () => {
    expect(isIndex('Indexing Board Wiring Diagram')).toBe(false)
  })
})

describe('keepsRow', () => {
  it('keeps a direct PDF and nothing else', () => {
    expect(keepsRow('https://example.com/sdo-6.pdf', 'SDO-6 Installation Instructions')).toBe(true)
    expect(keepsRow('https://example.com/manuals/', 'SDO-6 Installation Instructions')).toBe(false)
    expect(keepsRow('https://example.com/index.pdf', 'B&D Owner Manuals Index')).toBe(false)
  })
})

describe('SAME_MANUFACTURER', () => {
  it('only ever points at a parent, never at another alias', () => {
    // A chain would file a sub-brand under a slug that is itself folded
    // away, leaving its records in a file nothing reads.
    for (const target of Object.values(SAME_MANUFACTURER)) {
      expect(SAME_MANUFACTURER[target]).toBeUndefined()
    }
  })
})
