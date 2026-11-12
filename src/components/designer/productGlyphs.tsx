import type { ReactNode } from 'react'

/**
 * Thumbnails for gates, fences and shutters, in the same 96 × 62 frame and
 * palette as the garage door cards, so every product's option cards read
 * as one set. Each one draws the actual choice: the product, its infill,
 * which way it opens.
 */

const W = 96
const H = 62
const GROUND = '#55606d'
const BODY = '#3b4654'
const LIGHT = '#9aa5b1'
const ACCENT = '#5aa2ff'
const SKY = '#1b2533'

function Frame({ children, label }: { children?: ReactNode; label?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" role="img" aria-label={label}>
      <rect width={W} height={H} fill={SKY} />
      <rect y={H - 6} width={W} height={6} fill={GROUND} />
      {children}
    </svg>
  )
}

/** An infill pattern inside a rectangle. */
function Infill({ x, y, w, h, infill, fill = BODY }: { x: number; y: number; w: number; h: number; infill: string; fill?: string }) {
  const parts: ReactNode[] = [<rect key="f" x={x} y={y} width={w} height={h} fill="none" stroke={LIGHT} strokeWidth="1.4" />]
  if (infill === 'solid') parts.push(<rect key="s" x={x + 1} y={y + 1} width={w - 2} height={h - 2} fill={fill} />)
  else if (infill === 'pickets') {
    const n = Math.max(3, Math.round(w / 4.5))
    for (let i = 1; i < n; i++) parts.push(<path key={i} d={`M${x + (i * w) / n} ${y + 1}V${y + h - 1}`} stroke={LIGHT} strokeWidth="1.3" />)
  } else {
    const gap = infill === 'spaced-slats' ? 4.2 : 2.6
    for (let yy = y + 2; yy < y + h - 1; yy += gap) parts.push(<rect key={yy} x={x + 1} y={yy} width={w - 2} height={infill === 'spaced-slats' ? 2 : 2.1} fill={fill} />)
  }
  return <g>{parts}</g>
}

function Pillar({ x, h }: { x: number; h: number }) {
  return <rect x={x} y={H - 6 - h} width={6} height={h} fill="#7a838e" />
}

function Arrow({ d }: { d: string }) {
  return <path d={d} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
}

export function ProductGlyph({ type, infill = 'slats' }: { type: string; infill?: string }) {
  const base = H - 6
  if (type === 'sliding-gate')
    return (
      <Frame>
        <Pillar x={10} h={30} />
        <Infill x={17} y={base - 26} w={44} h={24} infill={infill} />
        <rect x={16} y={base - 1} width={74} height={1.4} fill={LIGHT} />
        <Arrow d="M66 22 H84 M79 17 L84 22 L79 27" />
      </Frame>
    )
  if (type === 'swing-gate')
    return (
      <Frame>
        <Pillar x={9} h={32} />
        <Pillar x={81} h={32} />
        <Infill x={16} y={base - 26} w={31} h={24} infill={infill} />
        <Infill x={49} y={base - 26} w={31} h={24} infill={infill} />
      </Frame>
    )
  if (type === 'pedestrian-gate')
    return (
      <Frame>
        <rect x={6} y={base - 22} width={26} height={22} fill="none" stroke="#5c6672" strokeWidth="1" />
        <rect x={64} y={base - 22} width={26} height={22} fill="none" stroke="#5c6672" strokeWidth="1" />
        <rect x={34} y={base - 30} width={3} height={30} fill="#7a838e" />
        <rect x={59} y={base - 30} width={3} height={30} fill="#7a838e" />
        <Infill x={38} y={base - 27} w={20} h={25} infill={infill} />
      </Frame>
    )
  if (type === 'fence')
    return (
      <Frame>
        {[6, 36, 66].map((x) => (
          <g key={x}>
            <rect x={x} y={base - 26} width={3} height={26} fill="#7a838e" />
            <Infill x={x + 3} y={base - 23} w={24} h={20} infill={infill} />
          </g>
        ))}
        <rect x={90} y={base - 26} width={3} height={26} fill="#7a838e" />
      </Frame>
    )
  if (type === 'window-shutter')
    return (
      <Frame>
        <rect x={14} y={6} width={68} height={base - 6} fill="#6b5a4b" />
        <rect x={30} y={14} width={36} height={30} fill="#1e2a38" />
        <rect x={28} y={10} width={40} height={6} rx={1} fill={LIGHT} />
        <Infill x={30} y={16} w={36} h={18} infill="slats" fill={LIGHT} />
      </Frame>
    )
  if (type === 'shop-shutter')
    return (
      <Frame>
        <rect x={8} y={6} width={80} height={base - 6} fill="#8b8f94" />
        <rect x={16} y={14} width={64} height={7} rx={1} fill={LIGHT} />
        <Infill x={18} y={21} w={60} h={base - 21} infill="slats" fill="#aab3bd" />
      </Frame>
    )
  return <Frame />
}

/** Cards for individual choices: infill, leaves, swing direction, slide direction, slat size. */
export function OptionGlyph({ group, value, type }: { group: string; value: string; type: string }): ReactNode {
  const base = H - 6
  if (group === 'infill') return <ProductGlyph type={type === 'fence' ? 'fence' : 'swing-gate'} infill={value} />
  if (group === 'leaves')
    return (
      <Frame>
        <Pillar x={9} h={32} />
        <Pillar x={81} h={32} />
        {value === '1' ? <Infill x={16} y={base - 26} w={64} h={24} infill="slats" /> : (
          <>
            <Infill x={16} y={base - 26} w={31} h={24} infill="slats" />
            <Infill x={49} y={base - 26} w={31} h={24} infill="slats" />
          </>
        )}
      </Frame>
    )
  if (group === 'swingDirection') {
    // Seen from above: the opening on a line, the leaf swinging up (inward) or down (outward).
    const out = value === 'out'
    return (
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <rect width={W} height={H} fill={SKY} />
        <rect x={0} y={out ? 0 : 31} width={W} height={31} fill={out ? '#22303f' : '#22303f'} opacity={0.5} />
        <text x={W - 6} y={out ? 12 : 56} textAnchor="end" fontSize="8" fill={LIGHT} fontFamily="sans-serif">
          {out ? 'street' : 'yard'}
        </text>
        <rect x={10} y={29} width={8} height={5} fill="#7a838e" />
        <rect x={78} y={29} width={8} height={5} fill="#7a838e" />
        <path d={out ? 'M18 31 L36 9' : 'M18 31 L36 53'} stroke={LIGHT} strokeWidth="3" strokeLinecap="round" />
        <path d={out ? 'M78 31 L60 9' : 'M78 31 L60 53'} stroke={LIGHT} strokeWidth="3" strokeLinecap="round" />
        <Arrow d={out ? 'M44 27 Q38 14 34 9' : 'M44 35 Q38 48 34 53'} />
        <Arrow d={out ? 'M52 27 Q58 14 62 9' : 'M52 35 Q58 48 62 53'} />
      </svg>
    )
  }
  if (group === 'slideDirection') {
    const left = value === 'left'
    return (
      <Frame>
        <Pillar x={45} h={30} />
        <Infill x={left ? 8 : 52} y={base - 26} w={36} h={24} infill="slats" />
        <rect x={4} y={base - 1} width={88} height={1.4} fill={LIGHT} />
        <Arrow d={left ? 'M40 14 H14 M19 9 L14 14 L19 19' : 'M56 14 H82 M77 9 L82 14 L77 19'} />
      </Frame>
    )
  }
  if (group === 'slat')
    return (
      <Frame>
        <Infill x={18} y={10} w={60} h={40} infill={value === '55' ? 'spaced-slats' : 'slats'} fill={LIGHT} />
      </Frame>
    )
  return null
}

/** Groups that are shown as picture cards rather than text chips. */
export const CARD_GROUPS = new Set(['infill', 'leaves', 'swingDirection', 'slideDirection', 'slat'])
