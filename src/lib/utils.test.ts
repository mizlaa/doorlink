import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('keeps the theme font sizes next to a text colour', () => {
    expect(cn('text-micro font-medium', 'text-graphite')).toBe('text-micro font-medium text-graphite')
    expect(cn('text-display', 'text-signal')).toContain('text-display')
  })

  it('still lets a later size replace an earlier one', () => {
    expect(cn('text-micro', 'text-sm')).toBe('text-sm')
  })
})
