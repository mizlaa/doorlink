import { describe, expect, it } from 'vitest'
import {
  OPERATORS,
  SPEC,
  allNumbers,
  firstNumber,
  motorFromModel,
  parseLeafWeightTable,
  recommendMotors,
  type MotorCandidate,
} from './specs'

function candidate(code: string, specs: Array<[string, string, string?]>, brand = 'acme'): MotorCandidate {
  const motor = motorFromModel({
    id: code,
    slug: code.toLowerCase(),
    name: code,
    modelCode: code,
    manufacturer: { name: brand.toUpperCase(), slug: brand },
    specs: specs.map(([label, value, unit]) => ({ label, value, unit })),
  })
  if (!motor) throw new Error(`${code} has no operator`)
  return motor
}

describe('number parsing', () => {
  it('reads the conservative end of a range', () => {
    expect(firstNumber('250–400')).toBe(250)
    expect(firstNumber('2.5')).toBe(2.5)
    expect(firstNumber('n/a')).toBeUndefined()
  })

  it('reads every option in a list', () => {
    expect(allNumbers('15, 25, 40, 50')).toEqual([15, 25, 40, 50])
  })

  it('reads a weight-by-length table in leaf-length order', () => {
    expect(parseLeafWeightTable('200 kg at 3 m, 300 kg at 2 m, 250 kg at 2.5 m')).toEqual([
      [2, 300],
      [2.5, 250],
      [3, 200],
    ])
  })
})

describe('motorFromModel', () => {
  it('ignores a model that does not say what operator it is', () => {
    expect(
      motorFromModel({
        id: 'x',
        slug: 'x',
        name: 'x',
        modelCode: 'x',
        manufacturer: { name: 'X', slug: 'x' },
        specs: [{ label: SPEC.maxGateWeight, value: '400', unit: 'kg' }],
      })
    ).toBeNull()
  })
})

describe('recommendMotors', () => {
  const slide400 = candidate('S400', [
    [SPEC.operator, OPERATORS.sliding],
    [SPEC.maxGateWeight, '400', 'kg'],
  ])
  const slide800 = candidate('S800', [
    [SPEC.operator, OPERATORS.sliding],
    [SPEC.maxGateWeight, '800', 'kg'],
  ])
  const slide1500 = candidate('S1500', [
    [SPEC.operator, OPERATORS.sliding],
    [SPEC.maxGateWeight, '1500', 'kg'],
    [SPEC.maxGateLength, '8', 'm'],
  ])

  it('only offers sliding motors rated for the gate', () => {
    const picks = recommendMotors({ kind: 'sliding', gateKg: 500, gateLengthM: 4 }, [
      slide400,
      slide800,
      slide1500,
    ])
    expect(picks.map((p) => p.motor.modelCode)).toEqual(['S800', 'S1500'])
  })

  it('puts a motor with a sensible margin ahead of one at its limit', () => {
    const picks = recommendMotors({ kind: 'sliding', gateKg: 380, gateLengthM: 4 }, [slide400, slide800])
    expect(picks[0].motor.modelCode).toBe('S800')
    expect(picks[1].motor.modelCode).toBe('S400')
  })

  it('respects a maximum gate length', () => {
    const picks = recommendMotors({ kind: 'sliding', gateKg: 300, gateLengthM: 10 }, [slide1500])
    expect(picks).toHaveLength(0)
  })

  it('applies a weight-by-length table at the leaf length', () => {
    const swingL = candidate('L300', [
      [SPEC.operator, OPERATORS.swingRam],
      [SPEC.maxLeafLength, '3', 'm'],
      [SPEC.leafWeightByLength, '300 kg at 2 m, 250 kg at 2.5 m, 200 kg at 3 m'],
    ])
    expect(
      recommendMotors({ kind: 'swing', style: 'ram', leafKg: 240, leafLengthM: 2.4 }, [swingL])
    ).toHaveLength(1)
    expect(
      recommendMotors({ kind: 'swing', style: 'ram', leafKg: 240, leafLengthM: 2.8 }, [swingL])
    ).toHaveLength(0)
  })

  it('keeps swing styles apart and flags a motor with no weight rating', () => {
    const ram = candidate('RAM', [
      [SPEC.operator, OPERATORS.swingRam],
      [SPEC.maxLeafLength, '3', 'm'],
    ])
    const arm = candidate('ARM', [
      [SPEC.operator, OPERATORS.swingArm],
      [SPEC.maxLeafLength, '3', 'm'],
    ])
    const picks = recommendMotors({ kind: 'swing', style: 'arm', leafKg: 100, leafLengthM: 2 }, [ram, arm])
    expect(picks.map((p) => p.motor.modelCode)).toEqual(['ARM'])
    expect(picks[0].caveat).toMatch(/no leaf weight/i)
  })

  it('picks the smallest tubular motor version with enough torque', () => {
    const t5 = candidate('T5', [
      [SPEC.operator, OPERATORS.tubular],
      [SPEC.torqueOptions, '15, 25, 40, 50', 'Nm'],
    ])
    const [pick] = recommendMotors({ kind: 'tubular', torqueNm: 18, curtainKg: 36 }, [t5])
    expect(pick.rating).toBe('25 Nm version')
    expect(recommendMotors({ kind: 'tubular', torqueNm: 60, curtainKg: 120 }, [t5])).toHaveLength(0)
  })

  it('filters by brand when asked', () => {
    const other = candidate(
      'S900',
      [
        [SPEC.operator, OPERATORS.sliding],
        [SPEC.maxGateWeight, '900', 'kg'],
      ],
      'other'
    )
    const picks = recommendMotors({ kind: 'sliding', gateKg: 300, gateLengthM: 4 }, [slide800, other], {
      brand: 'other',
    })
    expect(picks.map((p) => p.motor.modelCode)).toEqual(['S900'])
  })
})
