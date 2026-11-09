'use client'

import './xray.css'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CameraBus } from '@/components/three-v2/CameraRig'
import { detectTier, prefersReducedMotion, type Tier } from '@/components/three-v2/quality'
import { DEFAULT_LOOK, type DoorLook } from '@/components/three-v2/GarageScene'
import type { DoorPart } from '@/components/three-v2/Doors'
import { newControl, XRayScene, type XRayControl } from './XRayScene'

/**
 * Doorlink X-Ray Garage: an optional, educational look inside a sectional
 * garage door, opened from the homepage hero once its door is open.
 */

const STATIONS: Array<{ part: DoorPart; title: string; short: string; body: string }> = [
  {
    part: 'springs',
    title: 'Spring system',
    short: 'Springs',
    body: 'Torsion springs on the shaft above the opening counterbalance the door. As the door closes they wind up and store energy; as it opens they unwind and lift most of its weight, so the opener (or your arm) only does a little of the work. Springs are under high tension: adjusting them is a job for a trained technician.',
  },
  {
    part: 'opener',
    title: 'Motor & opener',
    short: 'Motor',
    body: 'The opener’s motor pulls a trolley along the rail by a belt or chain (or travels along the rail itself on a direct drive). An arm links the trolley to the top panel, so the motor pushes and pulls the door along its tracks.',
  },
  {
    part: 'tracks',
    title: 'Tracks & rollers',
    short: 'Tracks',
    body: 'Each panel has rollers at its edges that run in a vertical track, round a curved radius, and back along a horizontal track under the ceiling. The hinged panels follow the curve one after another, so the door folds from upright to flat without swinging out.',
  },
  {
    part: 'sensors',
    title: 'Safety sensors',
    short: 'Sensors',
    body: 'Photo-eye sensors near the floor send a light beam across the opening. If something breaks the beam while the door is closing, many openers stop and reverse the door. Run the test to see an illustration: real behaviour depends on the opener and how it is set up.',
  },
  {
    part: 'panels',
    title: 'Door panels',
    short: 'Panels',
    body: 'Sectional doors are made of hinged panels. Compare finishes and profiles, and see insulation as a concept: an insulated panel has a foam core between steel skins, which slows heat moving through the door.',
  },
]

const FINISHES = [
  { id: 'satin', label: 'Satin steel' },
  { id: 'gloss', label: 'Gloss' },
  { id: 'woodgrain', label: 'Timber-look' },
]
const PROFILES = [
  { id: 'flush', label: 'Flush' },
  { id: 'ribbed', label: 'Ribbed' },
  { id: 'raised', label: 'Raised' },
]
const INSULATION = [
  { id: 'none', label: 'Single skin' },
  { id: 'insulated', label: 'Insulated' },
]
const OPENERS = [
  { id: 'belt', label: 'Belt' },
  { id: 'chain', label: 'Chain' },
  { id: 'direct', label: 'Direct' },
  { id: 'none', label: 'Manual' },
]

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`xray-chip ${active ? 'is-active' : ''}`}>
      {children}
    </button>
  )
}

export default function XRayGarage({ onExit }: { onExit: () => void }) {
  const bus = useMemo(() => new CameraBus(), [])
  const control = useRef<XRayControl>(newControl())
  const maxTier = useMemo<Tier>(() => detectTier(), [])
  const [tier, setTier] = useState<Tier>(maxTier)
  const [ready, setReady] = useState(false)
  const [part, setPart] = useState<DoorPart | null>(null)
  const [thermal, setThermal] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [status, setStatus] = useState('Select a part, or tap a label in the garage.')
  const [look, setLook] = useState<DoorLook>({ ...DEFAULT_LOOK, profile: 'ribbed', windows: 'none', color: '#3a3f44', insulation: 'insulated' })
  const gauge = useRef<HTMLSpanElement>(null)
  const reduced = useMemo(prefersReducedMotion, [])

  // Lock the page behind, and close with Escape.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onExit()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onExit])

  // Glide from outside into the garage once it has loaded.
  const onReady = useCallback(() => {
    setReady(true)
    window.setTimeout(() => bus.send({ type: 'view', name: 'overview' }), reduced ? 0 : 350)
  }, [bus, reduced])

  // Spring-energy gauge, read straight from the door each frame (no re-render).
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (gauge.current) gauge.current.style.width = `${Math.round((1 - control.current.travel.eased) * 100)}%`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const select = (next: DoorPart) => {
    setPart(next)
    bus.send({ type: 'view', name: next })
    setStatus(STATIONS.find((s) => s.part === next)!.title)
  }
  const reset = () => {
    setPart(null)
    setThermal(false)
    bus.send({ type: 'view', name: 'overview' })
  }
  const setDoor = (open: boolean) => {
    const c = control.current
    c.demo = 'none'
    c.beamBroken = false
    c.obstacleZ = 2.2
    c.target = open ? 1 : 0
    c.playing = true
    setPlaying(true)
    setStatus(open ? 'Opening: the springs unwind and lift the door.' : 'Closing: the springs wind up and store energy.')
  }
  const cycle = () => {
    const c = control.current
    c.demo = 'cycle'
    c.clock = 0
    c.target = c.travel.t > 0.5 ? 0 : 1
    c.playing = true
    setPlaying(true)
    setStatus('Open and close on a loop, with the walls see-through. Pause any time.')
  }
  const obstruction = () => {
    const c = control.current
    if (part !== 'sensors') select('sensors')
    c.demo = 'obstruction'
    c.phase = 0
    c.clock = 0
    c.obstacleZ = 2.2
    c.beamBroken = false
    c.playing = true
    setPlaying(true)
    setStatus('Obstruction test: watch the beam near the floor.')
  }
  const togglePlay = () => {
    control.current.playing = !control.current.playing
    setPlaying(control.current.playing)
  }
  const thermalCompare = () => {
    if (part !== 'panels') select('panels')
    setThermal(true)
    // Close the door so the panels face the camera while the colours show.
    setDoor(false)
    setStatus('Thermal concept: warmer colours mean more heat passing through the panel.')
  }

  const station = STATIONS.find((s) => s.part === part)

  return (
    <div className="xray-root" role="dialog" aria-modal="true" aria-label="Doorlink X-Ray Garage">
      <header className="xray-top">
        <div className="min-w-0">
          <p className="xray-eyebrow">Doorlink X-Ray Garage</p>
          <p className="xray-sub">How a sectional garage door works · educational illustration, not an engineering model</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="xray-button-ghost" onClick={reset}>
            Reset view
          </button>
          <button type="button" className="xray-button" onClick={onExit}>
            Exit X-ray
          </button>
        </div>
      </header>

      <div className="xray-stage">
        <XRayScene
          bus={bus}
          tier={tier}
          maxTier={maxTier}
          onTier={setTier}
          onReady={onReady}
          control={control}
          part={part}
          look={look}
          thermal={thermal}
          onSelect={select}
          onStatus={setStatus}
        />
        {!ready && <div className="xray-loading">Preparing the X-ray view…</div>}
        <div className="xray-transport" role="group" aria-label="Door controls">
          <button type="button" className="xray-icon" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button type="button" className="xray-chip" onClick={() => setDoor(control.current.target < 0.5)}>
            Open / close
          </button>
          <button type="button" className="xray-icon" onClick={() => bus.send({ type: 'zoom', factor: 0.8 })} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="xray-icon" onClick={() => bus.send({ type: 'zoom', factor: 1.25 })} aria-label="Zoom out">
            −
          </button>
        </div>
        <p className="xray-status" aria-live="polite">
          {status}
        </p>
      </div>

      <aside className="xray-panel">
        <nav className="xray-stations" aria-label="Components">
          {STATIONS.map((s) => (
            <Chip key={s.part} active={part === s.part} onClick={() => select(s.part)}>
              {s.short}
            </Chip>
          ))}
        </nav>

        {station ? (
          <section className="xray-card">
            <h2 className="xray-card-title">{station.title}</h2>
            <p className="xray-card-body">{station.body}</p>
            {station.part === 'springs' && (
              <div className="mt-3">
                <p className="xray-label">Stored spring energy (illustrative)</p>
                <span className="xray-gauge">
                  <span ref={gauge} className="xray-gauge-fill" />
                </span>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip onClick={() => setDoor(false)}>Close the door</Chip>
                  <Chip onClick={() => setDoor(true)}>Open the door</Chip>
                </div>
              </div>
            )}
            {station.part === 'opener' && (
              <div className="mt-3">
                <p className="xray-label">Compare opening mechanisms</p>
                <div className="flex flex-wrap gap-2">
                  {OPENERS.map((o) => (
                    <Chip key={o.id} active={look.opener === o.id} onClick={() => setLook({ ...look, opener: o.id })}>
                      {o.label}
                    </Chip>
                  ))}
                </div>
                <div className="mt-3">
                  <Chip onClick={() => setDoor(control.current.target < 0.5)}>Run the motor</Chip>
                </div>
              </div>
            )}
            {station.part === 'tracks' && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip onClick={cycle}>Watch the panels turn the corner</Chip>
              </div>
            )}
            {station.part === 'sensors' && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip onClick={obstruction}>Run the obstruction test</Chip>
              </div>
            )}
            {station.part === 'panels' && (
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <p className="xray-label">Finish</p>
                  <div className="flex flex-wrap gap-2">
                    {FINISHES.map((f) => (
                      <Chip key={f.id} active={look.finish === f.id && !thermal} onClick={() => (setThermal(false), setLook({ ...look, finish: f.id, color: f.id === 'woodgrain' ? '#6b4a33' : '#3a3f44' }))}>
                        {f.label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="xray-label">Profile</p>
                  <div className="flex flex-wrap gap-2">
                    {PROFILES.map((p) => (
                      <Chip key={p.id} active={look.profile === p.id} onClick={() => setLook({ ...look, profile: p.id })}>
                        {p.label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="xray-label">Insulation</p>
                  <div className="flex flex-wrap gap-2">
                    {INSULATION.map((i) => (
                      <Chip key={i.id} active={look.insulation === i.id} onClick={() => setLook({ ...look, insulation: i.id })}>
                        {i.label}
                      </Chip>
                    ))}
                    <Chip active={thermal} onClick={() => (thermal ? setThermal(false) : thermalCompare())}>
                      Thermal view
                    </Chip>
                  </div>
                  {thermal && (
                    <p className="xray-note">
                      <span className="xray-swatch is-warm" /> more heat through <span className="xray-swatch is-cool" /> less heat through. A
                      concept picture only, not a measurement.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="xray-card">
            <h2 className="xray-card-title">Ever wondered what makes it work?</h2>
            <p className="xray-card-body">
              The walls are see-through. Pick a part to fly to it, or try an experiment below. Drag to look around, and pinch or scroll to zoom.
            </p>
          </section>
        )}

        <section className="xray-card">
          <h2 className="xray-card-title">Test your garage</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip onClick={cycle}>Open &amp; close (see-through)</Chip>
            <Chip onClick={obstruction}>Safety sensor test</Chip>
            <Chip onClick={thermalCompare}>Insulated vs single skin</Chip>
            <Chip onClick={() => select('opener')}>Compare openers</Chip>
          </div>
          <p className="xray-note">Educational demonstrations, simplified and not to any manufacturer’s specification.</p>
        </section>
      </aside>
    </div>
  )
}
