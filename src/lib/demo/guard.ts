import { isDemo } from './mode'

/**
 * Demo mode may only ever run against a database whose name says it is a
 * demo. This is the one check that stops a demo seed or reset from landing
 * on production data, so it is strict on purpose: the name must contain
 * "demo" as a word, and must not look like a production name.
 */

export class NotDemoDatabaseError extends Error {
  constructor(reason: string) {
    super(`Refusing to run demo mode: ${reason}. Point DATABASE_URL at a database whose name contains "demo", for example doorlink_demo.`)
    this.name = 'NotDemoDatabaseError'
  }
}

export function databaseNameFrom(url: string): string | null {
  try {
    const parsed = new URL(url)
    const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? '')
    return name || null
  } catch {
    return null
  }
}

/** Returns the database name if it is clearly a demo database, otherwise throws. */
export function assertDemoDatabaseUrl(url: string | undefined): string {
  if (!url) throw new NotDemoDatabaseError('DATABASE_URL is not set')
  const name = databaseNameFrom(url)
  if (!name) throw new NotDemoDatabaseError('DATABASE_URL has no database name')
  if (/prod|live|production/i.test(name)) throw new NotDemoDatabaseError(`database "${name}" looks like production`)
  if (!/(^|[_\-.])demo($|[_\-.])/i.test(name)) {
    throw new NotDemoDatabaseError(`database "${name}" does not say it is a demo`)
  }
  return name
}

/** Called once, before anything touches the database, whenever demo mode is on. */
export function assertDemoDatabaseIfDemo(url: string | undefined = process.env.DATABASE_URL): void {
  if (isDemo()) assertDemoDatabaseUrl(url)
}
