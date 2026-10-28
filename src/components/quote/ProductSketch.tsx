import type { QuoteProductCategory } from '@prisma/client'
import { colourHexFor, type Design } from '@/lib/quoting/design'

/**
 * A simple front elevation of the product, drawn to the customer's width
 * and height ratio. A design aid only: not a drawing of any specific
 * product.
 */
export function ProductSketch({ category, design, widthMm, heightMm }: { category: QuoteProductCategory; design: Design; widthMm: number; heightMm: number }) {
  const w = Number.isFinite(widthMm) && widthMm > 0 ? widthMm : 2400
  const h = Number.isFinite(heightMm) && heightMm > 0 ? heightMm : 2100
  const scale = 300 / Math.max(w, h)
  const W = Math.max(30, w * scale)
  const H = Math.max(30, h * scale)
  const x0 = (340 - W) / 2
  const y0 = 330 - H
  const fill = design.kind === 'simple' ? colourHexFor(design.colour) : colourHexFor(design.spec.colour)
  const style = design.kind === 'simple' ? design.style : 'door'
  const lines: React.ReactNode[] = []
  const stroke = 'rgba(255,255,255,0.45)'
  const isShutter = category === 'WINDOW_SHUTTER' || category === 'SHOP_SHUTTER' || category === 'GARAGE_DOOR'

  if (isShutter) {
    const slat = category === 'GARAGE_DOOR' ? H / 4 : Math.max(4, H / 24)
    for (let y = y0 + slat; y < y0 + H - 1; y += slat) lines.push(<line key={`s${y}`} x1={x0} x2={x0 + W} y1={y} y2={y} stroke={stroke} strokeWidth={category === 'GARAGE_DOOR' ? 2 : 1} />)
    if (style === 'perforated' || style === 'vented') for (let y = y0 + slat / 2; y < y0 + H; y += slat) for (let x = x0 + 6; x < x0 + W - 4; x += 8) lines.push(<circle key={`p${x}-${y}`} cx={x} cy={y} r={0.9} fill={stroke} />)
    if (style === 'grille') for (let x = x0 + 8; x < x0 + W; x += 8) lines.push(<line key={`g${x}`} x1={x} x2={x} y1={y0} y2={y0 + H} stroke={stroke} />)
  } else if (style === 'horizontal-slats') {
    for (let y = y0 + 8; y < y0 + H; y += 10) lines.push(<rect key={`h${y}`} x={x0} y={y} width={W} height={3} fill="var(--sketch-gap, #f4f4f2)" />)
  } else if (style === 'vertical-pickets') {
    for (let x = x0 + 9; x < x0 + W; x += 12) lines.push(<rect key={`v${x}`} x={x} y={y0 + 4} width={3} height={H - 8} fill="var(--sketch-gap, #f4f4f2)" />)
  } else if (style === 'mesh') {
    for (let x = x0; x < x0 + W; x += 7) lines.push(<line key={`m${x}`} x1={x} x2={x} y1={y0} y2={y0 + H} stroke={stroke} />)
    for (let y = y0; y < y0 + H; y += 7) lines.push(<line key={`n${y}`} x1={x0} x2={x0 + W} y1={y} y2={y} stroke={stroke} />)
  }
  const double = category === 'SWING_GATE' && design.kind === 'simple' && design.leaves !== 'single'

  return (
    <svg viewBox="0 0 340 345" role="img" aria-label="Sketch of your design at your proportions" className="h-auto w-full max-w-sm rounded-md border border-line bg-rail">
      <line x1={0} x2={340} y1={330.5} y2={330.5} stroke="#9aa0a6" />
      {category === 'SLIDING_GATE' && <line x1={x0 - 10} x2={x0 + W * 2} y1={333} y2={333} stroke="#6b7177" strokeWidth={3} />}
      <rect x={x0} y={y0} width={W} height={H} fill={fill} rx={category === 'FENCE' ? 0 : 2} />
      {lines}
      {double && <line x1={x0 + W / 2} x2={x0 + W / 2} y1={y0} y2={y0 + H} stroke="#1c1f22" strokeWidth={2} />}
      {(category === 'FENCE' || category.endsWith('GATE')) && (
        <>
          <rect x={x0 - 5} y={y0 - 6} width={5} height={H + 6} fill="#4a4f54" />
          <rect x={x0 + W} y={y0 - 6} width={5} height={H + 6} fill="#4a4f54" />
        </>
      )}
      <text x={170} y={343} textAnchor="middle" fontSize={9} fill="#5c6166">{w.toLocaleString('en-AU')} × {h.toLocaleString('en-AU')} mm</text>
    </svg>
  )
}
