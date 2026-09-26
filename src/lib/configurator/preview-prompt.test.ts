import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEC } from './options'
import { doorPreviewPrompt } from './preview-prompt'

describe('doorPreviewPrompt', () => {
  it('includes door type and opening from describeSpec', () => {
    const prompt = doorPreviewPrompt(DEFAULT_SPEC)
    expect(prompt).toContain('Sectional')
    expect(prompt).toContain('2400 × 2100 mm')
    expect(prompt).toContain('generic specification')
  })

  it('does not mention sections for a roller door', () => {
    const prompt = doorPreviewPrompt({ ...DEFAULT_SPEC, productType: 'roller' })
    expect(prompt).toContain('Roller')
    expect(prompt).not.toContain('Sections')
    expect(prompt).not.toContain('Windows')
  })

  it('mentions sections for sectional only', () => {
    const sectional = doorPreviewPrompt(DEFAULT_SPEC)
    expect(sectional).toContain('Sections')

    const tilt = doorPreviewPrompt({ ...DEFAULT_SPEC, productType: 'tilt' })
    expect(tilt).not.toContain('Sections')
  })
})
