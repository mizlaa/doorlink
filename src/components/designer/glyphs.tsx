import type { ReactNode } from 'react'

/**
 * The designer's drawings: the Doorlink mark, the tab and navigation
 * icons, and small pictures of each door style and window layout. All
 * inline SVG, so they are sharp at any size and cost no requests.
 */

export function DoorlinkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      {/* A house with its garage door: the roof in outline, the door in blue. */}
      <path d="M4 19.5 20 6l16 13.5" fill="none" stroke="#1F7CFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 18v15.5h24V18" fill="none" stroke="#1F7CFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="13" y="20" width="14" height="13.5" rx="1.2" fill="#1F7CFF" />
      <path d="M13 24.4h14M13 28.8h14" stroke="#0E1A2A" strokeWidth="1.5" />
      <rect x="17.2" y="21.3" width="5.6" height="1.9" rx="0.5" fill="#CFE3FF" />
    </svg>
  )
}

function Icon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const icons = {
  menu: (
    <Icon>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  ),
  close: (
    <Icon size={20}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  ),
  doorType: (
    <Icon>
      <rect x="3.5" y="5" width="17" height="14" rx="1.6" />
      <path d="M6.5 9h11M6.5 12h11M6.5 15h11" />
    </Icon>
  ),
  colour: (
    <Icon>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.8 1.9-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.9-1.8h2.1a3.6 3.6 0 0 0 3.6-3.6c0-4-3.8-7.2-8.5-7.2Z" />
      <circle cx="7.6" cy="11.2" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.4" cy="7.6" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="7.6" r="1" fill="currentColor" stroke="none" />
    </Icon>
  ),
  windows: (
    <Icon>
      <rect x="4" y="4.5" width="16" height="15" rx="1.6" />
      <path d="M12 4.5v15M4 12h16" />
    </Icon>
  ),
  hardware: (
    <Icon>
      <rect x="2.5" y="7" width="4" height="10" rx="1.4" />
      <rect x="17.5" y="7" width="4" height="10" rx="1.4" />
      <path d="M6.5 12h11" />
    </Icon>
  ),
  build: (
    <Icon>
      <path d="M4 6.5h16M4 12h16M4 17.5h16M7 4v16M17 4v16" />
    </Icon>
  ),
  expand: (
    <Icon size={20}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </Icon>
  ),
  collapse: (
    <Icon size={20}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </Icon>
  ),
  ruler: (
    <Icon size={14}>
      <path d="M3 17 17 3l4 4L7 21l-4-4ZM7.5 12.5l1.5 1.5M10.5 9.5l1.5 1.5M13.5 6.5 15 8" />
    </Icon>
  ),
  pin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z" />
    </svg>
  ),
  chevron: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  ),
  arrow: (
    <Icon size={20}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Icon>
  ),
  calendar: (
    <Icon>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M7.6 13.6h1.2M11.4 13.6h1.2M15.2 13.6h1.2M7.6 16.8h1.2M11.4 16.8h1.2" strokeWidth="1.9" />
    </Icon>
  ),
  check: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.3 2.7 2.7L16 9.5" />
    </svg>
  ),
  shield: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v5.5c0 4.3 3 7.6 7 9.5 4-1.9 7-5.2 7-9.5V6l-7-3Z" />
      <path d="m9 12 2.2 2.2L15 10.4" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.2 3.3a1.2 1.2 0 0 1 1.6 0l8 7.1c.8.7.3 2.1-.8 2.1h-.8v7a1.5 1.5 0 0 1-1.5 1.5h-3.2v-5.2a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1V21H7.3a1.5 1.5 0 0 1-1.5-1.5v-7H5c-1.100 0-1.6-1.400-.8-2.100l7-7.100Z" />
    </svg>
  ),
  designs: (
    <Icon>
      <path d="M4 10 12 4l8 6v9.500a.500.500 0 0 1-.5.500h-15a.500.500 0 0 1-.5-.500V10Z" />
      <rect x="8.500" y="12.500" width="7" height="7.500" rx="0.800" />
      <path d="M8.500 15h7M8.500 17.500h7" />
    </Icon>
  ),
  heart: (
    <Icon>
      <path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.300a4.300 4.300 0 0 1 7.500 2.500C19.500 15.400 12 20 12 20Z" />
    </Icon>
  ),
  quotes: (
    <Icon>
      <path d="M7 3.500h8l4 4V20a.500.500 0 0 1-.5.500h-11.500a.500.500 0 0 1-.5-.500V4a.500.500 0 0 1 .5-.500Z" />
      <path d="M9.500 11h5.500M9.500 14h5.500M9.500 17h3" />
    </Icon>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5.500" cy="12" r="1.900" />
      <circle cx="12" cy="12" r="1.900" />
      <circle cx="18.500" cy="12" r="1.900" />
    </svg>
  ),
  reset: (
    <Icon size={16}>
      <path d="M4 12a8 8 0 1 0 2.600-5.900M4 4.500V9h4.500" />
    </Icon>
  ),
}

export function Stars({ value }: { value: number }) {
  const full = Math.round(value * 2) / 2
  return (
    <span className="dz-stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = full >= i ? 1 : full >= i - 0.5 ? 0.5 : 0
        return (
          <svg key={i} width="13" height="13" viewBox="0 0 24 24">
            <defs>
              <linearGradient id={`dz-star-${i}-${fill}`}>
                <stop offset={`${fill * 100}%`} stopColor="currentColor" />
                <stop offset={`${fill * 100}%`} stopColor="rgba(255,255,255,0.18)" />
              </linearGradient>
            </defs>
            <path
              d="m12 3 2.700 5.600 6.100.900-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.900L12 3Z"
              fill={`url(#dz-star-${i}-${fill})`}
            />
          </svg>
        )
      })}
    </span>
  )
}

/**
 * A small drawing of a garage door in a given profile and window layout.
 * Neutral greys, like a catalogue thumbnail: the customer's colour shows
 * on the house, not here.
 */
export function DoorGlyph({ profile, windows, tone = 'dark' }: { profile: string; windows: string; tone?: 'dark' | 'light' }) {
  const W = 96
  const H = 62
  const pad = 5
  const dw = W - pad * 2
  const dh = H - pad * 2
  const body = tone === 'dark' ? '#3b4654' : '#9aa5b1'
  const line = tone === 'dark' ? '#232c38' : '#7d8894'
  const lift = tone === 'dark' ? '#4a5665' : '#b3bcc6'
  const glass = '#9fb9cc'
  const sections = 4
  const sh = dh / sections
  const parts: ReactNode[] = []

  if (profile === 'full-view') {
    parts.push(<rect key="bg" x={pad} y={pad} width={dw} height={dh} fill="#26303c" />)
    for (let r = 0; r < sections; r++) {
      for (let c = 0; c < 4; c++) {
        parts.push(
          <rect key={`g${r}${c}`} x={pad + 2 + (c * (dw - 2)) / 4} y={pad + 2 + r * sh} width={(dw - 2) / 4 - 2} height={sh - 3} fill="#6f8ea6" opacity={0.75 + ((r + c) % 2) * 0.2} />
        )
      }
    }
  } else {
    parts.push(<rect key="bg" x={pad} y={pad} width={dw} height={dh} fill={body} />)
    for (let r = 1; r < sections; r++) parts.push(<path key={`l${r}`} d={`M${pad} ${pad + r * sh}H${pad + dw}`} stroke={line} strokeWidth="1.2" />)
    if (profile === 'ribbed') {
      for (let r = 0; r < sections * 3; r++) parts.push(<path key={`r${r}`} d={`M${pad} ${pad + (r + 0.5) * (sh / 3)}H${pad + dw}`} stroke={line} strokeWidth="0.5" opacity="0.7" />)
    }
    if (profile === 'raised') {
      const cols = 4
      for (let r = 0; r < sections; r++) {
        if (r === 0 && (windows === 'top-row' || windows === 'top-row-wide')) continue
        for (let c = 0; c < cols; c++) {
          parts.push(
            <rect key={`p${r}${c}`} x={pad + 4 + (c * (dw - 4)) / cols} y={pad + 3 + r * sh} width={(dw - 4) / cols - 4} height={sh - 6} fill="none" stroke={lift} strokeWidth="1.1" rx="0.6" />
          )
        }
      }
    }
    if (profile === 'carriage') {
      for (let c = 1; c < 16; c++) parts.push(<path key={`b${c}`} d={`M${pad + (c * dw) / 16} ${pad}V${pad + dh}`} stroke={line} strokeWidth="0.5" opacity="0.8" />)
      for (const x of [pad, pad + dw / 2 - 2, pad + dw - 4]) parts.push(<rect key={`s${x}`} x={x} y={pad} width="4" height={dh} fill={lift} />)
      parts.push(<rect key="tr" x={pad} y={pad} width={dw} height="3" fill={lift} />)
      parts.push(<rect key="br" x={pad} y={pad + dh - 3} width={dw} height="3" fill={lift} />)
      parts.push(<rect key="mr" x={pad} y={pad + sh - 1.5} width={dw} height="3" fill={lift} />)
    }
    if (windows === 'top-row' || windows === 'top-row-wide') {
      const n = windows === 'top-row-wide' ? 6 : 4
      const gap = windows === 'top-row-wide' ? 2 : 6
      const gw = (dw - 8 - gap * (n - 1)) / n
      for (let c = 0; c < n; c++) parts.push(<rect key={`w${c}`} x={pad + 4 + c * (gw + gap)} y={pad + 3.5} width={gw} height={sh - 7} fill={glass} rx="0.6" />)
    }
    if (windows === 'right-stack' || windows === 'left-stack') {
      const gw = dw * 0.2
      const x = windows === 'right-stack' ? pad + dw - gw - 6 : pad + 6
      for (let r = 0; r < sections; r++) parts.push(<rect key={`k${r}`} x={x} y={pad + r * sh + sh * 0.27} width={gw} height={sh * 0.46} fill={glass} rx="0.6" />)
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect width={W} height={H} rx="5" fill="#1b2735" />
      {parts}
      <rect x={pad} y={pad} width={dw} height={dh} fill="none" stroke="#0d1520" strokeWidth="1" />
    </svg>
  )
}
