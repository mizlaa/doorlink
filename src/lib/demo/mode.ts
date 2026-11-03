/**
 * The demo switch. `DOORLINK_DEMO=true` turns the demo on; anything else
 * (including unset) is the normal product, and every branch that checks
 * this must behave exactly as before when it is false.
 *
 * Read at call time rather than frozen at import, so tests can flip it.
 * Not `server-only`: it is a plain flag that client components may import.
 */
export const DEMO_BANNER_TEXT = 'DEMO. No real businesses, prices, reviews or payments.'

/** Shown wherever a payment would have happened. */
export const DEMO_PAYMENT_NOTE = 'Demo: payment simulated, nothing was charged'

/** Shown wherever an AI image is returned instead of generated. */
export const DEMO_IMAGE_LABEL = 'Demo image'

export function isDemo(): boolean {
  return process.env.DOORLINK_DEMO === 'true'
}

/** Thrown by any code path that would otherwise reach an external provider in demo mode. */
export class DemoBlockedError extends Error {
  constructor(what: string) {
    super(`Demo mode: ${what} is never called. Nothing left the app.`)
    this.name = 'DemoBlockedError'
  }
}

/**
 * The dev session (cookie sign-in with no password) is off in production.
 * A demo build runs with NODE_ENV=production, so demo mode allows it. With
 * the demo switch off this is exactly the old rule.
 */
export function devSessionAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || isDemo()
}
