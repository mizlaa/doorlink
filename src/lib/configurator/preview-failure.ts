/** Whether a failed preview call should return the spent credit to the user. */
export function previewFailureRefundsCredit(input: {
  httpStatus?: number
  aborted: boolean
  networkError: boolean
}): boolean {
  if (input.aborted) return true
  if (input.networkError) return true
  if (input.httpStatus !== undefined && input.httpStatus >= 500) return true
  return false
}
