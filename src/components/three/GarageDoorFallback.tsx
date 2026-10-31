'use client'

import type { CSSProperties } from 'react'
import { useRef } from 'react'
import type { DoorLook } from './GarageDoorScene'

interface GarageDoorFallbackProps {
  isOpen: boolean
  onToggle: () => void
  look?: DoorLook
  showControls?: boolean
  className?: string
}

/**
 * A lightweight CSS scene for devices that cannot create WebGL.
 *
 * This is intentionally an interaction, not a static error state: the
 * fallback keeps the product's opening-door identity on older phones and
 * privacy-hardened browsers without adding another rendering dependency.
 */
export function GarageDoorFallback({
  isOpen,
  onToggle,
  look,
  showControls = true,
  className,
}: GarageDoorFallbackProps) {
  const pointerStart = useRef<number | null>(null)
  const panelCount =
    look?.kind === 'roller'
      ? 14
      : look?.kind === 'tilt'
        ? 1
        : Math.max(3, Math.min(6, look?.panelCount ?? 4))
  const style = {
    '--garage-fallback-door-color': look?.color ?? '#343a3e',
    '--garage-fallback-hardware-color': look?.hardwareColor ?? '#aeb5ba',
  } as CSSProperties
  const doorWidth = `${Math.max(48, Math.min(70, 54 * (look?.widthScale ?? 1)))}%`
  const doorHeight = `${Math.max(46, Math.min(66, 55 * (look?.heightScale ?? 1)))}%`

  return (
    <div
      className={['garage-fallback', className].filter(Boolean).join(' ')}
      style={style}
      role="group"
      aria-label="Interactive garage door preview"
      onPointerDown={(event) => {
        pointerStart.current = event.clientY
      }}
      onPointerUp={(event) => {
        if (pointerStart.current === null) return
        const distance = event.clientY - pointerStart.current
        pointerStart.current = null
        if (distance < -28 && !isOpen) onToggle()
        if (distance > 28 && isOpen) onToggle()
      }}
      onPointerCancel={() => {
        pointerStart.current = null
      }}
    >
      <div className="garage-fallback-sky" aria-hidden="true" />
      <div className="garage-fallback-house" aria-hidden="true">
        <div className="garage-fallback-roof" />
        <div className="garage-fallback-window garage-fallback-window-left" />
        <div className="garage-fallback-window garage-fallback-window-right" />
        <div className="garage-fallback-wall" />
        <div className="garage-fallback-drive" />
      </div>

      <div className={`garage-fallback-interior ${isOpen ? 'is-visible' : ''}`}>
        <span className="garage-fallback-wordmark">DOORLINK</span>
        <strong>ALL DEVELOPED FOR<br />AUTOMATED DOORS &amp; GATES</strong>
        <span className="garage-fallback-status">CONNECTED TRADE PLATFORM</span>
      </div>

      <div
        className={`garage-fallback-door ${isOpen ? 'is-open' : ''}`}
        data-kind={look?.kind ?? 'sectional'}
        data-profile={look?.profile ?? 'raised'}
        data-finish={look?.finish ?? 'satin'}
        data-windows={look?.windows ?? 'none'}
        style={{ width: doorWidth, height: doorHeight }}
        aria-hidden="true"
      >
        {Array.from({ length: panelCount }, (_, panel) => (
          <span key={panel} className="garage-fallback-panel">
            <span className="garage-fallback-panel-inset" />
          </span>
        ))}
      </div>

      {showControls && (
        <div className="garage-fallback-controls">
          <span className="garage-fallback-hint">{isOpen ? 'Entrance open' : 'Slide to open'}</span>
          <button type="button" onClick={onToggle} className="garage-fallback-button">
            {isOpen ? 'Close door' : 'Open door'}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
      <span className="garage-fallback-note">Lightweight preview for this device</span>
    </div>
  )
}