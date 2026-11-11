/**
 * The built-in logo builder.
 *
 * A logo here is a small set of choices (a layout, a garage-door symbol,
 * two colours, the company's name and initials), never a file someone
 * uploads. From those choices this module produces drawing primitives,
 * and the same primitives are rendered as SVG on screen and as vector
 * shapes in a PDF, so the logo on an invoice is exactly the one the owner
 * chose. Nothing here calls a paid service, and because the SVG is built
 * from validated choices there is no uploaded markup to sanitise.
 */

export type LogoTemplate = 'inline' | 'stacked' | 'badge' | 'monogram' | 'roofline' | 'bar'
export type LogoSymbol = 'sectional' | 'roller' | 'house' | 'arch'

export interface LogoDesign {
  template: LogoTemplate
  symbol: LogoSymbol
  primary: string
  accent: string
  name: string
  initials: string
}

export type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fill: string }
  | { t: 'poly'; points: Array<[number, number]>; fill: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { t: 'text'; x: number; y: number; size: number; bold: boolean; fill: string; text: string; anchor: 'start' | 'middle' | 'end'; spacing?: number }

export interface LogoDrawing {
  width: number
  height: number
  prims: Prim[]
}

export const LOGO_TEMPLATES: Array<{ id: LogoTemplate; label: string }> = [
  { id: 'inline', label: 'Symbol and name' },
  { id: 'stacked', label: 'Stacked' },
  { id: 'badge', label: 'Badge' },
  { id: 'monogram', label: 'Monogram' },
  { id: 'roofline', label: 'Roofline' },
  { id: 'bar', label: 'Bold bar' },
]

export const LOGO_SYMBOLS: Array<{ id: LogoSymbol; label: string }> = [
  { id: 'sectional', label: 'Panel door' },
  { id: 'roller', label: 'Roller door' },
  { id: 'house', label: 'House and garage' },
  { id: 'arch', label: 'Arched door' },
]

/** Colour pairs that hold up in print: a deep primary and a brighter accent. */
export const LOGO_PALETTES: Array<{ id: string; label: string; primary: string; accent: string }> = [
  { id: 'navy', label: 'Navy and blue', primary: '#17324D', accent: '#1F7CFF' },
  { id: 'charcoal', label: 'Charcoal and orange', primary: '#2C3033', accent: '#E8731A' },
  { id: 'forest', label: 'Forest and lime', primary: '#1F4033', accent: '#7DBE4B' },
  { id: 'black', label: 'Black and gold', primary: '#16181A', accent: '#C9A227' },
  { id: 'red', label: 'Red and slate', primary: '#B3261E', accent: '#3A4651' },
  { id: 'teal', label: 'Teal and sand', primary: '#0F5E66', accent: '#D8B46A' },
]

const HEX = /^#[0-9a-fA-F]{6}$/

export function initialsFor(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 &]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(and|&|the|of|pty|ltd|co)$/i.test(w))
  if (words.length === 0) return 'D'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/** Validates stored or submitted choices. Anything unrecognised is refused, not guessed. */
export function parseLogoDesign(raw: unknown): LogoDesign | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const template = LOGO_TEMPLATES.find((t) => t.id === input.template)?.id
  const symbol = LOGO_SYMBOLS.find((s) => s.id === input.symbol)?.id
  const name = typeof input.name === 'string' ? input.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 48) : ''
  const initials = typeof input.initials === 'string' ? input.initials.replace(/[^A-Za-z0-9&]/g, '').slice(0, 3).toUpperCase() : ''
  if (!template || !symbol || !name) return null
  if (typeof input.primary !== 'string' || !HEX.test(input.primary)) return null
  if (typeof input.accent !== 'string' || !HEX.test(input.accent)) return null
  return { template, symbol, primary: input.primary.toUpperCase(), accent: input.accent.toUpperCase(), name, initials: initials || initialsFor(name) }
}

/** A spread of starting points for a company: every layout, with symbols and palettes rotated through. */
export function logoOptions(name: string, palette?: { primary: string; accent: string }): LogoDesign[] {
  const clean = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 48) || 'Your Business'
  const initials = initialsFor(clean)
  return LOGO_TEMPLATES.map((template, i) => {
    const colours = palette ?? LOGO_PALETTES[i % LOGO_PALETTES.length]
    return {
      template: template.id,
      symbol: LOGO_SYMBOLS[i % LOGO_SYMBOLS.length].id,
      primary: colours.primary,
      accent: colours.accent,
      name: clean,
      initials,
    }
  })
}

// Rough advance widths for a bold sans-serif, as a share of the font size.
// Only used to size the canvas and place text; each renderer centres or
// right-aligns with its own real metrics.
function textWidth(text: string, size: number, bold: boolean, spacing = 0): number {
  let units = 0
  for (const ch of text) {
    if (' .,:;!|\'il'.includes(ch)) units += 0.3
    else if ('MW'.includes(ch)) units += 0.9
    else if ('mw'.includes(ch)) units += 0.84
    else if (ch >= 'A' && ch <= 'Z') units += 0.7
    else if (ch >= '0' && ch <= '9') units += 0.58
    else units += 0.56
  }
  return units * size * (bold ? 1 : 0.94) + spacing * Math.max(0, text.length - 1)
}

/** The garage-door symbol, drawn in a box of `size` at (x, y). */
function symbolPrims(symbol: LogoSymbol, x: number, y: number, size: number, fill: string, cut: string): Prim[] {
  const s = size
  const prims: Prim[] = []
  if (symbol === 'house') {
    prims.push({ t: 'poly', points: [[x + s * 0.5, y], [x + s, y + s * 0.42], [x + s * 0.9, y + s * 0.42], [x + s * 0.9, y + s], [x + s * 0.1, y + s], [x + s * 0.1, y + s * 0.42], [x, y + s * 0.42]], fill })
    const dx = x + s * 0.24
    const dy = y + s * 0.5
    const dw = s * 0.52
    const dh = s * 0.5
    prims.push({ t: 'rect', x: dx, y: dy, w: dw, h: dh, fill: cut })
    for (let i = 0; i < 3; i++) prims.push({ t: 'rect', x: dx + s * 0.035, y: dy + s * 0.04 + i * (dh / 3), w: dw - s * 0.07, h: dh / 3 - s * 0.055, fill })
    return prims
  }
  if (symbol === 'arch') {
    prims.push({ t: 'circle', cx: x + s / 2, cy: y + s * 0.42, r: s * 0.42, fill })
    prims.push({ t: 'rect', x: x + s * 0.08, y: y + s * 0.42, w: s * 0.84, h: s * 0.58, fill })
    for (let i = 1; i <= 3; i++) prims.push({ t: 'rect', x: x + s * 0.08, y: y + s * 0.42 + i * s * 0.145 - s * 0.018, w: s * 0.84, h: s * 0.036, fill: cut })
    prims.push({ t: 'rect', x: x + s * 0.3, y: y + s * 0.2, w: s * 0.4, h: s * 0.1, rx: s * 0.02, fill: cut })
    return prims
  }
  // A frame with a door in it: panels for a sectional, fine slats for a roller.
  prims.push({ t: 'rect', x, y, w: s, h: s, rx: s * 0.12, fill })
  const inset = s * 0.16
  const dw = s - inset * 2
  const dh = s - inset * 1.3
  const rows = symbol === 'roller' ? 7 : 4
  const gap = symbol === 'roller' ? s * 0.028 : s * 0.045
  const rh = (dh - gap * (rows - 1)) / rows
  for (let i = 0; i < rows; i++) prims.push({ t: 'rect', x: x + inset, y: y + inset * 0.75 + i * (rh + gap), w: dw, h: rh, rx: symbol === 'roller' ? 0 : s * 0.02, fill: cut })
  if (symbol === 'sectional') {
    // A row of small lights in the top panel.
    for (let i = 0; i < 3; i++) prims.push({ t: 'rect', x: x + inset + dw * 0.08 + i * (dw * 0.3), y: y + inset * 0.75 + rh * 0.24, w: dw * 0.22, h: rh * 0.52, fill })
  }
  return prims
}

/** Splits a long name over two lines at the space nearest its middle. */
function twoLines(name: string): [string, string | null] {
  if (name.length <= 16 || !name.includes(' ')) return [name, null]
  const mid = name.length / 2
  let best = -1
  for (let i = 0; i < name.length; i++) if (name[i] === ' ' && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  return [name.slice(0, best), name.slice(best + 1)]
}

const WHITE = '#FFFFFF'

export function logoDrawing(design: LogoDesign): LogoDrawing {
  const { primary, accent, name, initials, symbol } = design
  const upper = name.toUpperCase()
  const prims: Prim[] = []

  if (design.template === 'inline') {
    const h = 96
    const [a, b] = twoLines(name)
    const size = b ? 30 : 38
    const tw = Math.max(textWidth(a, size, true), b ? textWidth(b, size, true) : 0)
    prims.push(...symbolPrims(symbol, 8, 12, 72, primary, WHITE))
    prims.push({ t: 'text', x: 96, y: b ? 42 : 60, size, bold: true, fill: primary, text: a, anchor: 'start' })
    if (b) prims.push({ t: 'text', x: 96, y: 76, size, bold: true, fill: accent, text: b, anchor: 'start' })
    else prims.push({ t: 'rect', x: 96, y: 70, w: Math.min(tw, 120), h: 5, rx: 2.5, fill: accent })
    return { width: Math.ceil(96 + tw + 12), height: h, prims }
  }

  if (design.template === 'stacked') {
    const size = 26
    const tw = textWidth(upper, size, true, 2)
    const w = Math.max(190, Math.ceil(tw + 32))
    prims.push(...symbolPrims(symbol, w / 2 - 38, 6, 76, primary, WHITE))
    prims.push({ t: 'text', x: w / 2, y: 114, size, bold: true, fill: primary, text: upper, anchor: 'middle', spacing: 2 })
    prims.push({ t: 'rect', x: w / 2 - 28, y: 124, w: 56, h: 4, rx: 2, fill: accent })
    return { width: w, height: 136, prims }
  }

  if (design.template === 'badge') {
    const size = 24
    const tw = textWidth(upper, size, true, 1.5)
    const w = Math.max(220, Math.ceil(tw + 124))
    prims.push({ t: 'rect', x: 0, y: 0, w, h: 96, rx: 14, fill: primary })
    prims.push(...symbolPrims(symbol, 14, 14, 68, WHITE, primary))
    prims.push({ t: 'text', x: 98, y: 46, size, bold: true, fill: WHITE, text: upper, anchor: 'start', spacing: 1.5 })
    prims.push({ t: 'rect', x: 98, y: 58, w: Math.min(tw, w - 116), h: 4, rx: 2, fill: accent })
    prims.push({ t: 'text', x: 98, y: 80, size: 11, bold: false, fill: WHITE, text: 'GARAGE DOORS', anchor: 'start', spacing: 2.5 })
    return { width: w, height: 96, prims }
  }

  if (design.template === 'monogram') {
    const size = initials.length > 2 ? 34 : 42
    const [a, b] = twoLines(name)
    const nsize = b ? 24 : 30
    const tw = Math.max(textWidth(a, nsize, true), b ? textWidth(b, nsize, true) : 0)
    prims.push({ t: 'rect', x: 4, y: 4, w: 88, h: 88, rx: 18, fill: primary })
    prims.push({ t: 'rect', x: 4, y: 74, w: 88, h: 18, fill: accent })
    prims.push({ t: 'rect', x: 4, y: 74, w: 88, h: 9, fill: primary })
    prims.push({ t: 'rect', x: 4, y: 83, w: 88, h: 9, rx: 0, fill: accent })
    prims.push({ t: 'text', x: 48, y: 60, size, bold: true, fill: WHITE, text: initials, anchor: 'middle' })
    prims.push({ t: 'text', x: 108, y: b ? 44 : 58, size: nsize, bold: true, fill: primary, text: a, anchor: 'start' })
    if (b) prims.push({ t: 'text', x: 108, y: 74, size: nsize, bold: true, fill: primary, text: b, anchor: 'start' })
    return { width: Math.ceil(108 + tw + 10), height: 96, prims }
  }

  if (design.template === 'roofline') {
    const size = 30
    const tw = textWidth(name, size, true)
    const w = Math.max(200, Math.ceil(tw + 40))
    const cx = w / 2
    // A roof drawn as two strokes over the name, with a small door under the ridge.
    prims.push({ t: 'poly', points: [[cx, 4], [w - 8, 46], [w - 22, 46], [cx, 18], [22, 46], [8, 46]], fill: primary })
    prims.push({ t: 'rect', x: cx - 15, y: 30, w: 30, h: 22, rx: 2, fill: accent })
    prims.push({ t: 'rect', x: cx - 15, y: 36, w: 30, h: 2, fill: WHITE })
    prims.push({ t: 'rect', x: cx - 15, y: 43, w: 30, h: 2, fill: WHITE })
    prims.push({ t: 'text', x: cx, y: 86, size, bold: true, fill: primary, text: name, anchor: 'middle' })
    return { width: w, height: 98, prims }
  }

  // bar
  const size = 32
  const tw = textWidth(upper, size, true, 1)
  const w = Math.max(180, Math.ceil(tw + 26))
  prims.push({ t: 'rect', x: 0, y: 0, w: 10, h: 84, fill: accent })
  prims.push({ t: 'text', x: 24, y: 40, size, bold: true, fill: primary, text: upper, anchor: 'start', spacing: 1 })
  prims.push({ t: 'text', x: 25, y: 66, size: 13, bold: false, fill: primary, text: 'GARAGE DOORS  ·  GATES  ·  SERVICE', anchor: 'start', spacing: 1.6 })
  return { width: Math.max(w, 300), height: 84, prims }
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const n = (value: number) => Number(value.toFixed(2))

/** The logo as a standalone SVG document. Every value in it is a number, a validated hex colour or escaped text. */
export function logoSvg(design: LogoDesign): string {
  const drawing = logoDrawing(design)
  const body = drawing.prims
    .map((p) => {
      if (p.t === 'rect') return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"${p.rx ? ` rx="${n(p.rx)}"` : ''} fill="${p.fill}"/>`
      if (p.t === 'poly') return `<polygon points="${p.points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="${p.fill}"/>`
      if (p.t === 'line') return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${p.stroke}" stroke-width="${n(p.width)}"/>`
      if (p.t === 'circle') return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${p.fill}"/>`
      return `<text x="${n(p.x)}" y="${n(p.y)}" font-family="Helvetica, Arial, sans-serif" font-size="${n(p.size)}" font-weight="${p.bold ? 700 : 400}" fill="${p.fill}" text-anchor="${p.anchor}"${p.spacing ? ` letter-spacing="${n(p.spacing)}"` : ''}>${escapeXml(p.text)}</text>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${drawing.width} ${drawing.height}" width="${drawing.width}" height="${drawing.height}" role="img" aria-label="${escapeXml(design.name)} logo">${body}</svg>`
}
