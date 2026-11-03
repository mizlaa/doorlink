import { navigate } from '../router'
import { bookQuote } from '../demo/flows'

export type BookingState = { error?: string }

export async function bookQuoteAction(_prev: BookingState, formData: FormData): Promise<BookingState> {
  const result = bookQuote(formData)
  if (result.error) return { error: result.error }
  navigate(`/jobs/${result.jobId}?booked=1`)
  return {}
}
