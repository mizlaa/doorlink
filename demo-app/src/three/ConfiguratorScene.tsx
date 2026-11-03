import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Preview } from './look'
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
      className="demo-scene relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 via-slate-100 to-slate-200 sm:aspect-[16/10]"
      data-demo-scene
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
      <ViewControls bus={bus} spinning={spinning} insideLabel={scene === 'garage' ? 'Inside' : 'Street'} />
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

function ViewControls({ bus, spinning, insideLabel }: { bus: CameraBus; spinning: boolean; insideLabel: string }) {
  const [view, setView] = useState<ViewName>('angle')
  const go = (name: ViewName) => {
    setView(name)
    bus.send({ type: 'view', name })
  }
  const reduced = useMemo(prefersReducedMotion, [])
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
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
        {!reduced && (
          <ControlButton label={spinning ? 'Stop turning' : 'Turn 360°'} onClick={() => bus.send({ type: 'spin', on: !spinning })} active={spinning}>
            360°
          </ControlButton>
        )}
      </div>
    </div>
  )
}
