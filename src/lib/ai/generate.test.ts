import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEC } from '@/lib/configurator/options'
import { generationCacheKey } from './generate'

describe('generationCacheKey', () => {
  it('is the same for the same design however its keys are ordered', () => {
    const reordered = Object.fromEntries(Object.entries(DEFAULT_SPEC).reverse()) as typeof DEFAULT_SPEC
    expect(generationCacheKey(DEFAULT_SPEC, null, 'Keep the piers')).toBe(generationCacheKey(reordered, null, ' keep  the piers '))
  })

  it('changes with the design, the photo or the notes', () => {
    const base = generationCacheKey(DEFAULT_SPEC, null, '')
    expect(generationCacheKey({ ...DEFAULT_SPEC, colour: 'chalk' }, null, '')).not.toBe(base)
    expect(generationCacheKey(DEFAULT_SPEC, new Uint8Array([1, 2, 3]), '')).not.toBe(base)
    expect(generationCacheKey(DEFAULT_SPEC, null, 'brick piers')).not.toBe(base)
  })
})
