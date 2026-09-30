'use client'

import { useEffect, useState } from 'react'
import { GarageDoorScene } from './GarageDoorScene'
import { GarageDoorFallback } from './GarageDoorFallback'
import { supportsThreeWebGL } from './webgl'

// Some phones and locked-down browsers genuinely don't have WebGL. The CSS
// scene keeps the entry experience useful instead of showing a broken canvas.
function HeroFallback({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  return <GarageDoorFallback isOpen={isOpen} onToggle={onToggle} />
}

// The line the door reveals. It lives here rather than inside the scene
// so the 3D code stays about geometry and lighting.
const REVEAL_HEADLINE = 'ALL DEVELOPED FOR AUTOMATED DOORS & GATES'

export function DoorHero3D() {
  const [isOpen, setIsOpen] = useState(false)
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    setSupported(supportsThreeWebGL())
  }, [])

  if (supported === false) return <HeroFallback isOpen={isOpen} onToggle={() => setIsOpen((value) => !value)} />

  return (
    <div
      className="hero-scene-shell relative aspect-[4/3] w-full touch-pan-y overflow-hidden rounded-lg sm:aspect-[16/10]"
      onPointerDown={(event) => {
        event.currentTarget.dataset.pointerY = String(event.clientY)
      }}
      onPointerUp={(event) => {
        const startY = Number(event.currentTarget.dataset.pointerY)
        if (!Number.isFinite(startY)) return
        delete event.currentTarget.dataset.pointerY
        const distance = event.clientY - startY
        if (distance < -28 && !isOpen) setIsOpen(true)
        if (distance > 28 && isOpen) setIsOpen(false)
      }}
    >
      {supported === null ? (
        <div className="absolute inset-0 animate-pulse bg-slate-800/80" />
      ) : (
        <GarageDoorScene
          isOpen={isOpen}
          revealHeadline={REVEAL_HEADLINE}
          revealWordmark="DOORLINK"
        />
      )}

      <p className="absolute left-4 top-4 rounded border border-white/15 bg-graphite/55 px-3 py-1.5 text-micro font-medium uppercase tracking-[0.14em] text-paper/80 backdrop-blur">
        Drag to explore
      </p>

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        // Bottom-right, not centred: centred, it sat straight across the
        // line the door reveals.
        className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded border border-white/20 bg-graphite/90 px-4 py-2.5 text-sm font-medium text-paper shadow-lg backdrop-blur transition hover:bg-graphite"
      >
        {isOpen ? 'Close door' : 'Open door'} <span aria-hidden="true">↗</span>
      </button>
      <p className="absolute bottom-5 left-4 text-micro font-medium uppercase tracking-[0.14em] text-paper/70">
        {isOpen ? 'Entrance open' : 'Slide up to enter'}
      </p>
    </div>
  )
}
