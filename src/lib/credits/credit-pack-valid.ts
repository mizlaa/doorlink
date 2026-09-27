export function creditPackPurchaseValid(input: {
  packCredits: number
  packPriceCents: number
  packCurrency: string
  metadataCredits: number | null
  metadataPriceCents: number | null
  amountTotal: number | null
  currency: string | null
}): boolean {
  if (input.metadataCredits !== input.packCredits) return false
  if (input.metadataPriceCents !== input.packPriceCents) return false
  if (input.amountTotal !== input.packPriceCents) return false
  if (!input.currency || input.currency.toLowerCase() !== input.packCurrency.toLowerCase()) return false
  return true
}
