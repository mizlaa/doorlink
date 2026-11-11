import { describe, expect, it } from 'vitest'
import { initialsFor, logoDrawing, logoOptions, logoSvg, parseLogoDesign } from './logo'

describe('logo builder', () => {
  it('offers one option per layout, all valid', () => {
    const options = logoOptions('Harbour Garage Doors')
    expect(options).toHaveLength(6)
    for (const option of options) expect(parseLogoDesign(option)).toEqual(option)
  })

  it('makes initials from the meaningful words', () => {
    expect(initialsFor('Harbour Garage Doors Pty Ltd')).toBe('HGD')
    expect(initialsFor('Doorworks')).toBe('DO')
    expect(initialsFor('')).toBe('D')
  })

  it('refuses anything it does not recognise', () => {
    const good = logoOptions('Acme')[0]
    expect(parseLogoDesign({ ...good, template: 'script' })).toBeNull()
    expect(parseLogoDesign({ ...good, primary: 'red' })).toBeNull()
    expect(parseLogoDesign({ ...good, accent: '#12345' })).toBeNull()
    expect(parseLogoDesign({ ...good, name: '' })).toBeNull()
    expect(parseLogoDesign('not an object')).toBeNull()
  })

  it('strips markup from the name and escapes text in the SVG', () => {
    const design = parseLogoDesign({ ...logoOptions('x')[0], name: 'A & B <script>alert(1)</script>' })!
    expect(design.name).not.toMatch(/[<>]/)
    const svg = logoSvg({ ...design, name: 'Tom & "Jerry"' })
    expect(svg).not.toContain('<script')
    expect(svg).toContain('&amp;')
  })

  it('leaves room for long names in every layout', () => {
    for (const option of logoOptions('Northern Beaches Overhead Doors')) {
      const drawing = logoDrawing(option)
      expect(drawing.width).toBeGreaterThan(150)
      expect(drawing.width).toBeLessThan(1200)
    }
  })
})
