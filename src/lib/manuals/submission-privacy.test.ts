import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPubliclyServable, resolveFileUrl } from '../storage'
import { submissionFileKey } from './submission-files'

// The property the whole feature rests on: a manual nobody has approved
// is not reachable. It is asserted here rather than left to the reading
// of a `where` clause, because the failure mode is silent — a leaked
// upload looks exactly like a working one.

describe('an unapproved submission is not public', () => {
  beforeEach(() => {
    // These cases exercise local-public storage, independently of the
    // developer's real connected storage configuration.
    vi.stubEnv('SUPABASE_STORAGE_BUCKET', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  const key = submissionFileKey('sub_123', 'application/pdf')

  it('stores submissions outside the publicly servable prefix', () => {
    expect(isPubliclyServable(key)).toBe(false)
  })

  it('refuses to produce a public URL for one', () => {
    // No Supabase configured in tests, so this exercises the local
    // backend — the one that serves straight out of public/.
    expect(resolveFileUrl(key)).toBeNull()
  })

  it('still serves an approved manufacturer manual', () => {
    // The guard must not be so broad it breaks the library it protects.
    expect(isPubliclyServable('manuals/faac/e045.pdf')).toBe(true)
    expect(resolveFileUrl('manuals/faac/e045.pdf')).toBe('/manuals/faac/e045.pdf')
  })

  it('cannot be tricked into the public prefix by a hostile id', () => {
    // A submission id that tries to climb out of its directory.
    for (const id of ['../manuals/x', '..%2Fmanuals%2Fx', 'manuals/../../manuals/x']) {
      const forged = submissionFileKey(id, 'application/pdf')
      expect(forged.startsWith('manual-submissions/')).toBe(true)
      expect(isPubliclyServable(forged)).toBe(false)
    }
  })
})
