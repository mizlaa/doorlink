import { getDemo } from '../demo/store'
import { requestCustomQuote } from '../demo/flows'

export type CustomQuoteState = { error?: string; ok?: boolean }

export async function requestCustomQuoteAction(_prev: CustomQuoteState, formData: FormData): Promise<CustomQuoteState> {
  if (!getDemo().session) return { error: 'Sign in to ask for a custom quote.' }
  const comparison = String(formData.get('comparison') ?? '')
  const business = String(formData.get('business') ?? '')
  const message = String(formData.get('message') ?? '').trim()
  requestCustomQuote(comparison, business, message)
  return { ok: true }
}
