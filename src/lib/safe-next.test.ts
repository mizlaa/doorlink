import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-next'

describe('safeNextPath', () => {
  it('keeps a path on this site, query and all', () => {
    expect(safeNextPath('/quote?spec=%7B%7D')).toBe('/quote?spec=%7B%7D')
  })

  it('refuses anything that could leave the site', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'quote',
      '/x\nSet-Cookie',
      null,
    ]) {
      expect(safeNextPath(value)).toBe('/')
    }
  })
})
