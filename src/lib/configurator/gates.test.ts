import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPEC,
  describeSpec,
  familyOf,
  groupsFor,
  parseSpec,
  sizeLimitsFor,
  specAsBrief,
  specForType,
} from './options'
import { estimateFor, requirementFor, roughKg } from './estimate'
import { gateLookFromSpec, previewFromSpec } from './look'

const slidingGate = specForType(DEFAULT_SPEC, 'sliding-gate')
const swingGate = specForType(DEFAULT_SPEC, 'swing-gate')
const shutter = specForType(DEFAULT_SPEC, 'window-shutter')

describe('product families', () => {
  it('groups types the way a customer thinks of them', () => {
    expect(familyOf('sectional')).toBe('garage')
    expect(familyOf('pedestrian-gate')).toBe('gate')
    expect(familyOf('window-shutter')).toBe('shutter')
  })

  it('shows gate options on gates and garage options only on garage doors', () => {
    const gate = groupsFor('swing-gate').map((g) => g.id)
    expect(gate).toEqual(expect.arrayContaining(['infill', 'material', 'leaves', 'swingMotor', 'motorBrand']))
    expect(gate).not.toContain('opener')
    expect(gate).not.toContain('insulation')
    expect(groupsFor('sliding-gate').map((g) => g.id)).not.toContain('leaves')
    expect(groupsFor('fence').map((g) => g.id)).not.toContain('motorBrand')
    expect(groupsFor('sectional').map((g) => g.id)).not.toContain('infill')
  })

  it('offers only brands that make that kind of motor', () => {
    const brands = (type: Parameters<typeof groupsFor>[0]) =>
      groupsFor(type).find((g) => g.id === 'motorBrand')?.values.map((v) => v.id)
    expect(brands('sliding-gate')).toContain('faac')
    expect(brands('sliding-gate')).not.toContain('somfy')
    expect(brands('window-shutter')).toEqual(expect.arrayContaining(['somfy', 'simu', 'cw-products', 'maxim', 'nice']))
    expect(brands('window-shutter')).not.toContain('merlin')
  })
})

describe('sizes per type', () => {
  it('resets the size when switching family and clamps within one', () => {
    expect(slidingGate).toMatchObject({ widthMm: 4000, heightMm: 1800 })
    expect(shutter).toMatchObject({ widthMm: 1200, heightMm: 1500 })
    const wide = { ...slidingGate, widthMm: 9000 }
    expect(specForType(wide, 'pedestrian-gate').widthMm).toBe(sizeLimitsFor('pedestrian-gate').widthMm.max)
  })

  it('clamps a stored gate against gate limits, not garage ones', () => {
    expect(parseSpec({ productType: 'sliding-gate', widthMm: 10000 }).widthMm).toBe(10000)
    expect(parseSpec({ productType: 'window-shutter', widthMm: 50 }).widthMm).toBe(400)
    expect(parseSpec({ productType: 'fence' }).widthMm).toBe(6000)
  })

  it('drops a brand that does not fit the new type', () => {
    const somfyShutter = { ...shutter, motorBrand: 'somfy' }
    expect(specForType(somfyShutter, 'sliding-gate').motorBrand).toBe('any')
    expect(specForType({ ...shutter, motorBrand: 'nice' }, 'swing-gate').motorBrand).toBe('nice')
  })

  it('defaults a pedestrian gate to manual', () => {
    expect(specForType(DEFAULT_SPEC, 'pedestrian-gate').operation).toBe('manual')
    expect(parseSpec({ productType: 'pedestrian-gate' }).operation).toBe('manual')
  })
})

describe('describeSpec for outdoor products', () => {
  it('names the product and leaves out garage rows', () => {
    const rows = describeSpec(swingGate)
    expect(rows[0]).toEqual({ label: 'Gate type', value: 'Swing gate' })
    expect(rows.map((r) => r.label)).toEqual(expect.arrayContaining(['Leaves', 'Infill', 'Material', 'Motor style']))
    expect(rows.map((r) => r.label)).not.toContain('Opener')
    for (const row of rows) expect(row.value).not.toMatch(/^[a-z-]+$/)
  })

  it('leaves the motor out of a manual gate', () => {
    expect(specAsBrief({ ...swingGate, operation: 'manual' })).not.toContain('Motor brand')
  })

  it('describes a fence run and a shutter window', () => {
    expect(describeSpec(specForType(DEFAULT_SPEC, 'fence'))[1]).toEqual({ label: 'Run', value: '6000 mm long × 1800 mm high' })
    expect(describeSpec(shutter)[1]).toEqual({ label: 'Window', value: '1200 × 1500 mm' })
  })
})

describe('estimates', () => {
  it('weighs a gate from its area and material', () => {
    // 4 m × 1.8 m of aluminium at 12 kg/m².
    expect(estimateFor(slidingGate)?.totalKg).toBeCloseTo(86.4)
    expect(estimateFor({ ...slidingGate, material: 'solid-steel' })?.totalKg).toBeCloseTo(360)
  })

  it('splits a double swing gate into two leaves', () => {
    const estimate = estimateFor(swingGate)
    expect(estimate?.leafLengthM).toBeCloseTo(1.8)
    expect(estimate?.leafKg).toBeCloseTo((3.6 * 1.8 * 12) / 2)
    expect(estimateFor({ ...swingGate, leaves: '1' })?.leafLengthM).toBeCloseTo(3.6)
  })

  it('asks a shutter motor for 1 Nm per 2 kg of curtain', () => {
    const estimate = estimateFor(shutter)
    expect(estimate?.totalKg).toBeCloseTo(1.2 * 1.5 * 2.9 * 1.1)
    expect(estimate?.torqueNm).toBeCloseTo((estimate?.totalKg ?? 0) / 2)
  })

  it('needs no motor for a fence, a manual gate or a hand-wound shutter', () => {
    expect(requirementFor(specForType(DEFAULT_SPEC, 'fence'))).toBeNull()
    expect(requirementFor({ ...swingGate, operation: 'manual' })).toBeNull()
    expect(requirementFor({ ...shutter, control: 'manual' })).toBeNull()
    expect(requirementFor(DEFAULT_SPEC)).toBeNull()
  })

  it('turns a design into the requirement the matcher understands', () => {
    expect(requirementFor(slidingGate)).toMatchObject({ kind: 'sliding', gateLengthM: 4 })
    expect(requirementFor({ ...swingGate, swingMotor: 'underground' })).toMatchObject({ kind: 'swing', style: 'underground' })
    expect(requirementFor(shutter)).toMatchObject({ kind: 'tubular' })
  })

  it('rounds weights the way an estimate should read', () => {
    expect(roughKg(86.4)).toBe('about 90 kg')
    expect(roughKg(5.7)).toBe('about 6 kg')
  })
})

describe('gate preview', () => {
  it('sends gates to the gate scene at real size', () => {
    const preview = previewFromSpec(slidingGate)
    expect(preview.scene).toBe('gate')
    expect(gateLookFromSpec(slidingGate)).toMatchObject({ kind: 'sliding', widthM: 4, heightM: 1.8, motorised: true })
    expect(gateLookFromSpec({ ...shutter, slat: '55' }).slatM).toBe(0.055)
    expect(previewFromSpec(DEFAULT_SPEC).scene).toBe('garage')
  })
})
