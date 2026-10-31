'use client'

import { useRef } from 'react'
import type { GateLook } from './GateScene'

interface GatePreviewFallbackProps {
  look: GateLook
  isOpen: boolean
  onToggle: () => void
}

function GateInfill({
  x,
  y,
  width,
  height,
  look,
}: {
  x: number
  y: number
  width: number
  height: number
  look: GateLook
}) {
  const inset = 12
  const innerX = x + inset
  const innerY = y + inset
  const innerWidth = Math.max(1, width - inset * 2)
  const innerHeight = Math.max(1, height - inset * 2)

  if (look.infill === 'solid') {
    return (
      <rect
        x={innerX}
        y={innerY}
        width={innerWidth}
        height={innerHeight}
        rx="2"
        fill={look.color}
        opacity="0.92"
      />
    )
  }

  if (look.infill === 'pickets') {
    const count = Math.max(5, Math.floor(innerWidth / 25))
    const gap = innerWidth / count
    return (
      <g fill={look.color}>
        {Array.from({ length: count }, (_, index) => (
          <rect
            key={index}
            x={innerX + index * gap + gap * 0.34}
            y={innerY}
            width={Math.max(3, gap * 0.32)}
            height={innerHeight}
            rx="2"
          />
        ))}
      </g>
    )
  }

  const count = Math.max(5, Math.floor(innerHeight / 18))
  const band = innerHeight / count
  const bandHeight = look.infill === 'spaced-slats' ? band * 0.58 : band * 0.82

  return (
    <g fill={look.color}>
      {Array.from({ length: count }, (_, index) => (
        <rect
          key={index}
          x={innerX}
          y={innerY + index * band + (band - bandHeight) / 2}
          width={innerWidth}
          height={bandHeight}
          rx="1"
        />
      ))}
    </g>
  )
}

function GateLeaf({
  x,
  y,
  width,
  height,
  look,
}: {
  x: number
  y: number
  width: number
  height: number
  look: GateLook
}) {
  return (
    <g>
      <GateInfill x={x} y={y} width={width} height={height} look={look} />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke={look.hardwareColor}
        strokeWidth="10"
      />
      <circle cx={x + 10} cy={y + height - 12} r="5" fill={look.hardwareColor} />
      <circle cx={x + width - 10} cy={y + height - 12} r="5" fill={look.hardwareColor} />
    </g>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function GatePreviewFallback({ look, isOpen, onToggle }: GatePreviewFallbackProps) {
  const pointerStart = useRef<number | null>(null)
  const isShutter = look.kind === 'shutter' || look.kind === 'shop'
  const isFence = look.kind === 'fence'
  const gateWidth = isFence ? 570 : look.kind === 'pedestrian' ? 245 : clamp(look.widthM * 112, 300, 530)
  const gateHeight = clamp(look.heightM * 88, 132, 232)
  const gateX = (800 - gateWidth) / 2
  const groundY = 410
  const gateY = groundY - gateHeight
  const leafCount = look.kind === 'swing' && look.leaves === 2 ? 2 : 1
  const leafWidth = gateWidth / leafCount
  const openingWidth = look.kind === 'shop' ? 510 : 420
  const openingHeight = look.kind === 'shop' ? 290 : 245
  const openingX = (800 - openingWidth) / 2
  const openingY = 110
  const slatCount = clamp(Math.floor(openingHeight / (look.slatM * 350)), 6, 20)
  const label = isShutter
    ? look.kind === 'shop'
      ? 'Shop shutter'
      : 'Window shutter'
    : isFence
      ? 'Fence'
      : look.kind === 'sliding'
        ? 'Sliding gate'
        : look.kind === 'pedestrian'
          ? 'Pedestrian gate'
          : 'Swing gate'

  function finishDrag(clientY: number) {
    if (pointerStart.current === null) return
    const distance = clientY - pointerStart.current
    pointerStart.current = null
    if (Math.abs(distance) > 28) onToggle()
  }

  return (
    <div
      className="configurator-fallback-scene"
      role="group"
      aria-label={`Interactive ${label.toLowerCase()} preview`}
      onPointerDown={(event) => {
        pointerStart.current = event.clientY
      }}
      onPointerUp={(event) => finishDrag(event.clientY)}
      onPointerCancel={() => {
        pointerStart.current = null
      }}
    >
      <svg
        viewBox="0 0 800 600"
        className="configurator-fallback-art"
        role="img"
        aria-label={`${label}, ${look.widthM.toFixed(1)} metres wide and ${look.heightM.toFixed(1)} metres high`}
      >
        <defs>
          <linearGradient id="fallback-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#b8d3e6" />
            <stop offset="1" stopColor="#eef3f3" />
          </linearGradient>
          <linearGradient id="fallback-drive" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#c3c8c8" />
            <stop offset="1" stopColor="#8e9697" />
          </linearGradient>
        </defs>

        {isShutter ? (
          <>
            <rect width="800" height="600" fill="url(#fallback-sky)" />
            <path d="M0 430 800 400v200H0Z" fill="url(#fallback-drive)" />
            <rect x="74" y="72" width="652" height="366" rx="5" fill="#e6e2d9" />
            <rect x="115" y="116" width="570" height="28" fill="#c1beb7" />
            <rect
              x={openingX - 18}
              y={openingY - 18}
              width={openingWidth + 36}
              height={openingHeight + 36}
              fill="#364149"
            />
            <rect
              x={openingX}
              y={openingY}
              width={openingWidth}
              height={openingHeight}
              fill={isOpen ? '#233948' : '#d9e0e2'}
            />
            {isOpen && (
              <g opacity="0.85">
                <rect x={openingX + 16} y={openingY + 18} width={openingWidth - 32} height={openingHeight - 30} fill="#304d60" />
                <path d={`M${openingX + 40} ${openingY + openingHeight - 16}l130 -125 100 80 90 -96 90 141Z`} fill="#829aa6" />
              </g>
            )}
            <g
              style={{
                transform: isOpen ? `translateY(-${openingHeight * 0.78}px)` : 'translateY(0)',
                transition: 'transform 650ms cubic-bezier(0.22, 0.7, 0.22, 1)',
              }}
            >
              <rect x={openingX} y={openingY} width={openingWidth} height={openingHeight} fill={look.color} />
              {Array.from({ length: slatCount }, (_, index) => {
                const bandHeight = openingHeight / slatCount
                return (
                  <line
                    key={index}
                    x1={openingX}
                    x2={openingX + openingWidth}
                    y1={openingY + index * bandHeight}
                    y2={openingY + index * bandHeight}
                    stroke={look.hardwareColor}
                    strokeWidth="3"
                    opacity="0.8"
                  />
                )
              })}
            </g>
            <rect x={openingX - 18} y={openingY - 20} width={openingWidth + 36} height="16" rx="3" fill="#c5c6c1" />
          </>
        ) : (
          <>
            <rect width="800" height="600" fill="url(#fallback-sky)" />
            <circle cx="678" cy="95" r="36" fill="#f6e6bc" opacity="0.8" />
            <path d="M0 370 190 300l142 65 190-92 278 84v80H0Z" fill="#8a9b91" />
            <path d="M0 432h800v168H0Z" fill="url(#fallback-drive)" />
            <path d="M0 480h800" stroke="#edf0ed" strokeWidth="3" opacity="0.55" />
            <rect x="91" y="120" width="618" height="300" fill="#e7e3da" opacity="0.66" />
            <rect x="114" y="142" width="572" height="14" fill="#b8b5ae" />
            <rect x="102" y="408" width="596" height="12" fill="#30383b" opacity="0.75" />

            {isFence ? (
              <>
                {[gateX, gateX + gateWidth / 2 - 10, gateX + gateWidth - 20].map((x) => (
                  <rect key={x} x={x} y={gateY - 18} width="20" height={gateHeight + 38} rx="3" fill={look.hardwareColor} />
                ))}
                {[0, 1].map((section) => (
                  <GateLeaf
                    key={section}
                    x={gateX + section * (gateWidth / 2)}
                    y={gateY}
                    width={gateWidth / 2}
                    height={gateHeight}
                    look={look}
                  />
                ))}
              </>
            ) : (
              <>
                <rect x={gateX - 34} y={gateY - 26} width="28" height={gateHeight + 50} rx="4" fill="#d5d3cc" />
                <rect x={gateX + gateWidth + 6} y={gateY - 26} width="28" height={gateHeight + 50} rx="4" fill="#d5d3cc" />
                <rect x={gateX - 28} y={gateY - 32} width={gateWidth + 56} height="12" rx="3" fill="#b9b8b1" />
                {look.motorised && look.kind === 'sliding' && (
                  <g>
                    <rect x={gateX + gateWidth - 34} y={groundY - 46} width="32" height="34" rx="4" fill="#e1e2df" stroke="#9da3a4" strokeWidth="3" />
                    <circle cx={gateX + gateWidth - 18} cy={groundY - 28} r="5" fill="#657078" />
                    <path d={`M${gateX - 20} ${groundY + 4}h${gateWidth + 40}`} stroke="#555e62" strokeWidth="6" />
                  </g>
                )}

                {look.kind === 'sliding' ? (
                  <g
                    style={{
                      transform: isOpen ? `translateX(-${gateWidth * 0.72}px)` : 'translateX(0)',
                      transition: 'transform 650ms cubic-bezier(0.22, 0.7, 0.22, 1)',
                    }}
                  >
                    <GateLeaf x={gateX} y={gateY} width={gateWidth} height={gateHeight} look={look} />
                  </g>
                ) : (
                  Array.from({ length: leafCount }, (_, index) => {
                    const x = gateX + index * leafWidth
                    const rotation = isOpen ? (index === 0 ? -38 : 38) : 0
                    return (
                      <g
                        key={index}
                        style={{
                          transform: `rotate(${rotation}deg)`,
                          transformBox: 'fill-box',
                          transformOrigin: index === 0 ? 'left bottom' : 'right bottom',
                          transition: 'transform 650ms cubic-bezier(0.22, 0.7, 0.22, 1)',
                        }}
                      >
                        <GateLeaf x={x} y={gateY} width={leafWidth} height={gateHeight} look={look} />
                      </g>
                    )
                  })
                )}
              </>
            )}
          </>
        )}
      </svg>

      <span className="configurator-fallback-label">Interactive preview</span>
    </div>
  )
}
