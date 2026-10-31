import { describe, expect, it } from 'vitest'
import {
  calculateBasedSplit,
  calculateSplit,
  DEFAULT_COMMISSION_BPS,
  formatCommissionRate,
  MAX_COMMISSION_BPS,
  proportionalBase,
} from './commission'

describe('calculateSplit', () => {
  it('splits the brief’s worked example exactly', () => {
    // $500 gross at 10% => $50 commission, $450 to the worker.
    const split = calculateSplit(50_000, 1000)
    expect(split.commissionCents).toBe(5_000)
    expect(split.workerPayoutCents).toBe(45_000)
  })

  it('never loses or invents a cent, at any rate or amount', () => {
    // The property that matters: the two halves must always reconstruct
    // the gross. Rounding each half independently is how a marketplace
    // ends up unable to reconcile its own ledger.
    const amounts = [1, 2, 3, 7, 99, 101, 333, 4_999, 12_345, 99_999, 1_000_000]
    const rates = [0, 1, 250, 999, 1000, 1250, 3333, MAX_COMMISSION_BPS]

    for (const gross of amounts) {
      for (const rate of rates) {
        const split = calculateSplit(gross, rate)
        expect(split.commissionCents + split.workerPayoutCents).toBe(gross)
        expect(split.commissionCents).toBeGreaterThanOrEqual(0)
        expect(split.workerPayoutCents).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('takes $250 of a $5,000 booking at the default rate', () => {
    const split = calculateSplit(500_000, DEFAULT_COMMISSION_BPS)
    expect(formatCommissionRate(DEFAULT_COMMISSION_BPS)).toBe('5%')
    expect(split.commissionCents).toBe(25_000)
    expect(split.workerPayoutCents).toBe(475_000)
  })

  it('takes nothing at a zero rate', () => {
    const split = calculateSplit(12_345, 0)
    expect(split.commissionCents).toBe(0)
    expect(split.workerPayoutCents).toBe(12_345)
  })

  it('handles a zero-value job without dividing by anything', () => {
    const split = calculateSplit(0, DEFAULT_COMMISSION_BPS)
    expect(split.commissionCents).toBe(0)
    expect(split.workerPayoutCents).toBe(0)
  })

  it('rejects fractional or negative money rather than silently rounding it', () => {
    expect(() => calculateSplit(10.5, 1000)).toThrow()
    expect(() => calculateSplit(-1, 1000)).toThrow()
  })

  it('rejects a rate outside the allowed band', () => {
    expect(() => calculateSplit(1000, -1)).toThrow()
    expect(() => calculateSplit(1000, MAX_COMMISSION_BPS + 1)).toThrow()
    expect(() => calculateSplit(1000, 12.5)).toThrow()
  })
})

describe('formatCommissionRate', () => {
  it('renders whole percentages without trailing zeros', () => {
    expect(formatCommissionRate(1000)).toBe('10%')
    expect(formatCommissionRate(0)).toBe('0%')
  })

  it('keeps only the decimals a rate actually has', () => {
    // "12.50%" sitting next to "10%" in the same list reads as two
    // different kinds of number, so trailing zeros are trimmed.
    expect(formatCommissionRate(1250)).toBe('12.5%')
    expect(formatCommissionRate(1255)).toBe('12.55%')
    expect(formatCommissionRate(1)).toBe('0.01%')
    expect(formatCommissionRate(10)).toBe('0.1%')
  })
})

describe('calculateBasedSplit', () => {
  it('works the spec example: 5% of $3,000 ex GST on a $3,300 job', () => {
    const split = calculateBasedSplit(330_000, 300_000, 500)
    expect(split.commissionCents).toBe(15_000)
    expect(split.workerPayoutCents).toBe(315_000)
    expect(split.commissionCents + split.workerPayoutCents).toBe(330_000)
  })

  it('refuses a base larger than the payment', () => {
    expect(() => calculateBasedSplit(1_000, 2_000, 500)).toThrow()
  })

  it('splits a base across a deposit and balance without losing a cent', () => {
    const totalGross = 330_000
    const totalBase = 300_000
    const deposit = 99_000
    const balance = totalGross - deposit
    const depositBase = proportionalBase(totalBase, totalGross, deposit)
    const balanceBase = totalBase - depositBase
    expect(depositBase).toBe(90_000)
    expect(balanceBase).toBe(210_000)
    expect(proportionalBase(totalBase, totalGross, balance)).toBe(balanceBase)
  })
})
