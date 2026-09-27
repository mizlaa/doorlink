import { describe, expect, it } from 'vitest'
import { creditPackPurchaseValid } from './credit-pack-valid'
import { previewCreditsForPriceCents } from './constants'
import { previewFailureRefundsCredit } from '../configurator/preview-failure'

describe('creditPackPurchaseValid', () => {
  it('accepts matching pack, metadata, and session totals', () => {
    expect(
      creditPackPurchaseValid({
        packCredits: 5,
        packPriceCents: 900,
        packCurrency: 'AUD',
        metadataCredits: 5,
        metadataPriceCents: 900,
        amountTotal: 900,
        currency: 'aud',
      })
    ).toBe(true)
  })

  it('rejects a mismatched amount', () => {
    expect(
      creditPackPurchaseValid({
        packCredits: 5,
        packPriceCents: 900,
        packCurrency: 'AUD',
        metadataCredits: 5,
        metadataPriceCents: 900,
        amountTotal: 800,
        currency: 'aud',
      })
    ).toBe(false)
  })
})

describe('previewCreditsForPriceCents', () => {
  it('sizes the AUD packs from a $0.18 USD generation', () => {
    expect(previewCreditsForPriceCents(900)).toBe(35)
    expect(previewCreditsForPriceCents(1900)).toBe(74)
    expect(previewCreditsForPriceCents(3900)).toBe(152)
  })
})

describe('previewFailureRefundsCredit', () => {
  it('refunds on timeout, network errors, and 5xx', () => {
    expect(previewFailureRefundsCredit({ aborted: true, networkError: false })).toBe(true)
    expect(previewFailureRefundsCredit({ aborted: false, networkError: true })).toBe(true)
    expect(previewFailureRefundsCredit({ httpStatus: 500, aborted: false, networkError: false })).toBe(true)
  })

  it('does not refund on 4xx', () => {
    expect(previewFailureRefundsCredit({ httpStatus: 400, aborted: false, networkError: false })).toBe(false)
    expect(previewFailureRefundsCredit({ httpStatus: 429, aborted: false, networkError: false })).toBe(false)
  })
})
