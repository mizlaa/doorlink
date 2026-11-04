'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Preview } from '@/lib/configurator/look-v2'
import { GarageDoorFallback } from '@/components/three/GarageDoorFallback'
import { GatePreviewFallback } from '@/components/three/GatePreviewFallback'
import { supportsThreeWebGL } from '@/components/three/webgl'
import { GarageScene } from './GarageScene'
import { GateScene } from './GateScene'
import { CameraBus, type ViewName } from './CameraRig'
import { detectTier, prefersReducedMotion, type Tier } from './quality'

/**
 * Demo replacement for src/components/three/ConfiguratorScene.tsx. Same
 * props, so the app's Configurator uses it unchanged; adds view, zoom and
 * spin controls, adaptive quality, and pauses rendering off-screen.
 */
export const ConfiguratorScene = memo(function ConfiguratorScene({
  preview,
  isOpen,
  onToggle,
}: {
  preview: Preview
  isOpen: boolean
  onToggle: () => void
}) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const bus = useMemo(() => new CameraBus(), [])
  const maxTier = useMemo<Tier>(() => detectTier(), [])
  const [tier, setTier] = useState<Tier>(maxTier)
  const [visible, setVisible] = useState(true)
  const [ready, setReady] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  // Full screen: the same canvas, re-laid out over the whole viewport.
  const [immersive, setImmersive] = useState(false)
  useEffect(() => {
    if (!immersive) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Ancestors with a backdrop filter, transform or their own stacking context (the
    // sticky preview columns) would trap a fixed element; lift them while full screen.
    const lifted: Array<[HTMLElement, string]> = []
    for (let n = wrapper.current?.parentElement; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n)
      const stacked = c.zIndex !== 'auto' || c.position === 'sticky' || c.position === 'fixed'
      if (c.backdropFilter !== 'none' || c.transform !== 'none' || c.filter !== 'none' || c.contain !== 'none' || stacked) {
        lifted.push([n, n.style.cssText])
        n.style.setProperty('backdrop-filter', 'none')
        n.style.setProperty('-webkit-backdrop-filter', 'none')
        n.style.setProperty('transform', 'none')
        n.style.setProperty('filter', 'none')
        n.style.setProperty('contain', 'none')
        if (stacked) n.style.setProperty('z-index', '300')
      }
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setImmersive(false)
    window.addEventListener('keydown', onKey)
    return () => {
      for (const [n, css] of lifted) n.style.cssText = css
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [immersive])
  // Reframe for the new shape once the canvas has resized.
  useEffect(() => {
    const t = window.setTimeout(() => bus.send({ type: 'view', name: 'angle' }), 80)
    return () => window.clearTimeout(t)
  }, [immersive, bus])

  useEffect(() => {
    setSupported(supportsThreeWebGL())
  }, [])
  useEffect(() => bus.onSpin(setSpinning), [bus])

  // Stop rendering when the preview is scrolled away or the tab is hidden.
  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    let onScreen = true
    const update = () => setVisible(onScreen && document.visibilityState === 'visible')
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      update()
    })
    observer.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
  }, [supported])

  const markReady = useCallback(() => setReady(true), [])
  const scene = preview.scene
  useEffect(() => {
    setReady(false)
  }, [scene])

  if (supported === false) {
    return scene === 'garage' ? (
      <GarageDoorFallback isOpen={isOpen} onToggle={onToggle} look={preview.look} showControls={false} className="rounded-2xl border border-line" />
    ) : (
      <GatePreviewFallback look={preview.look} isOpen={isOpen} onToggle={onToggle} />
    )
  }

  return (
    <div
      ref={wrapper}
      className={
        immersive
          ? 'demo-scene is-immersive fixed inset-0 z-[300] overflow-hidden bg-gradient-to-b from-sky-100 via-slate-100 to-slate-200'
          : 'demo-scene relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 via-slate-100 to-slate-200 sm:aspect-[16/10]'
      }
      data-demo-scene
      role={immersive ? 'dialog' : undefined}
      aria-label={immersive ? '3D preview, full screen' : undefined}
    >
      {supported &&
        (preview.scene === 'garage' ? (
          <GarageScene
            isOpen={isOpen}
            look={preview.look}
            bus={bus}
            tier={tier}
            maxTier={maxTier}
            onTier={setTier}
            paused={!visible}
            onReady={markReady}
          />
        ) : (
          <GateScene
            isOpen={isOpen}
            look={preview.look}
            bus={bus}
            tier={tier}
            maxTier={maxTier}
            onTier={setTier}
            paused={!visible}
            onReady={markReady}
          />
        ))}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/70 backdrop-blur-[2px]">
          <span className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-micro font-medium text-graphite shadow-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-signal" /> Loading 3D view
          </span>
        </div>
      )}
      <ViewControls bus={bus} spinning={spinning} insideLabel={scene === 'garage' ? 'Inside' : 'Street'} immersive={immersive} onImmersive={setImmersive} />
      {immersive && (
        <button
          type="button"
          onClick={() => setImmersive(false)}
          className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] flex h-10 items-center gap-2 rounded-full bg-white/90 px-4 text-sm font-semibold text-graphite shadow-md backdrop-blur"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          Exit full screen
        </button>
      )}
    </div>
  )
})

function ControlButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`demo-scene-button flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-semibold transition-colors ${
        active ? 'bg-signal text-paper' : 'bg-white/90 text-graphite hover:bg-white'
      }`}
    >
      {children}
    </button>
  )
}

function ViewControls({
  bus,
  spinning,
  insideLabel,
  immersive,
  onImmersive,
}: {
  bus: CameraBus
  spinning: boolean
  insideLabel: string
  immersive: boolean
  onImmersive: (on: boolean) => void
}) {
  const [view, setView] = useState<ViewName>('angle')
  const go = (name: ViewName) => {
    setView(name)
    bus.send({ type: 'view', name })
  }
  const reduced = useMemo(prefersReducedMotion, [])
  return (
    <div className={`pointer-events-none absolute inset-x-2 flex items-end justify-between gap-2 ${immersive ? 'bottom-[max(12px,env(safe-area-inset-bottom))]' : 'bottom-2'}`}>
      <div className="pointer-events-auto flex gap-1 rounded-full bg-black/10 p-1 shadow-sm backdrop-blur-sm" role="group" aria-label="Camera view">
        <ControlButton label="Three-quarter view" onClick={() => go('angle')} active={view === 'angle' && !spinning}>
          3/4
        </ControlButton>
        <ControlButton label="Front view" onClick={() => go('front')} active={view === 'front' && !spinning}>
          Front
        </ControlButton>
        <ControlButton label="Side view" onClick={() => go('side')} active={view === 'side' && !spinning}>
          Side
        </ControlButton>
        <ControlButton label={`${insideLabel} view`} onClick={() => go('inside')} active={view === 'inside' && !spinning}>
          {insideLabel}
        </ControlButton>
      </div>
      <div className="pointer-events-auto flex gap-1 rounded-full bg-black/10 p-1 shadow-sm backdrop-blur-sm" role="group" aria-label="Zoom and spin">
        <ControlButton label="Zoom in" onClick={() => bus.send({ type: 'zoom', factor: 0.78 })}>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </ControlButton>
        <ControlButton label="Zoom out" onClick={() => bus.send({ type: 'zoom', factor: 1.28 })}>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </ControlButton>
        <ControlButton label={immersive ? 'Exit full screen' : 'Full screen'} onClick={() => onImmersive(!immersive)} active={immersive}>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path d={immersive ? 'M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4' : 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </ControlButton>
        {!reduced && (
          <ControlButton label={spinning ? 'Stop turning' : 'Turn 360°'} onClick={() => bus.send({ type: 'spin', on: !spinning })} active={spinning}>
            360°
          </ControlButton>
        )}
      </div>
    </div>
  )
}
