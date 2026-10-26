// Availability only: never cache users, tokens or authentication results.
const AUTH_BUDGET_MS = 3000
const RETRY_AFTER_MS = 15000
let unavailableUntil = 0

export const AUTH_UNAVAILABLE_MESSAGE =
  'The sign-in service is currently unreachable. Public tools are still available. Please try signing in again shortly.'

export class AuthServiceUnavailableError extends Error {
  constructor() {
    super(AUTH_UNAVAILABLE_MESSAGE)
    this.name = 'AuthServiceUnavailableError'
  }
}

export function isAuthServiceUnavailable(): boolean {
  return Date.now() < unavailableUntil
}

/**
 * Bound the entire SDK operation, including its internal refresh retries.
 * An aborted fetch alone is insufficient: the SDK retries refresh for ~30s.
 * After failure/timeout, prevent late refreshes from writing response cookies.
 */
export async function runAuthOperation<T>(
  run: (context: { fetch: typeof fetch; canWriteCookies: () => boolean }) => Promise<T>
): Promise<T> {
  if (isAuthServiceUnavailable()) throw new AuthServiceUnavailableError()

  const controller = new AbortController()
  let active = true
  let rejectUnavailable!: (error: AuthServiceUnavailableError) => void
  const unavailable = new Promise<never>((_, reject) => { rejectUnavailable = reject })
  const fail = () => {
    if (!active) return
    active = false
    unavailableUntil = Date.now() + RETRY_AFTER_MS
    rejectUnavailable(new AuthServiceUnavailableError())
    controller.abort()
  }
  const timer = setTimeout(fail, AUTH_BUDGET_MS)
  const boundedFetch: typeof fetch = async (input, init) => {
    if (!active) throw new AuthServiceUnavailableError()
    try {
      const signal = init?.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal
      const response = await fetch(input, { ...init, signal })
      if (response.status >= 500) fail()
      return response
    } catch (error) {
      fail()
      throw error
    }
  }

  try {
    // Promise.race observes the SDK's eventual rejection as well. It may finish
    // its retry timer later, but cannot make further network calls/cookie writes.
    return await Promise.race([
      run({ fetch: boundedFetch, canWriteCookies: () => active }),
      unavailable,
    ])
  } finally {
    active = false
    clearTimeout(timer)
    controller.abort()
  }
}
