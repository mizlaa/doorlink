'use client'

import '@/components/xray/xray.css'
import './world.css'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CameraBus } from '@/components/three-v2/CameraRig'
import { detectTier, prefersReducedMotion, type Tier } from '@/components/three-v2/quality'
import { IntroCaption, IntroOverlays, markIntroSeen, type IntroBusiness, type IntroOverlay } from './Intro'
import { hush, isMuted, say, setMuted, voiceAvailable } from './voice'
import { AFTER, BEFORE, FENCE_STYLES, PRODUCT_VIEW, WorldScene, type FenceStyle, type Product, type WorldState } from './WorldScene'
import Link from 'next/link'
import { colourHex } from '@/lib/configurator/options'

const XRayGarage = lazy(() => import('@/components/xray/XRayGarage'))

/**
 * Doorlink: the whole property in one scene, opened from the
 * homepage hero. A one-touch transformation fits every product in turn,
 * then each one operates when tapped. Visual demo only: nothing here
 * touches quotes, accounts or real products.
 */

const STEPS = ['Garage door', 'Driveway gate', 'Fencing', 'Roller shutters', 'Automation']

const INFO: Record<Product, { title: string; body: string; verbs?: [string, string] }> = {
  garage: {
    title: 'Sectional garage door',
    body: 'Hinged panels roll up curved tracks to sit under the ceiling. Springs balance the door’s weight, so the opener only has to guide it.',
    verbs: ['Open', 'Close'],
  },
  gate: {
    title: 'Automated sliding gate',
    body: 'The gate rolls on wheels along a ground track and runs back behind the fence. A motor beside the track drives it along a toothed rack.',
    verbs: ['Open', 'Close'],
  },
  pedestrian: {
    title: 'Pedestrian gate',
    body: 'A single leaf on hinges with a latch on the far pillar, styled to match the fence and driveway gate.',
    verbs: ['Open', 'Close'],
  },
  shutters: {
    title: 'Window roller shutters',
    body: 'Slats run down guide rails and roll onto an axle in the housing above the window, where a tubular motor turns them. They add shade and privacy.',
    verbs: ['Raise', 'Lower'],
  },
  fence: {
    title: 'Perimeter fencing',
    body: 'Panels sit between posts set in concrete footings. Try another style: the gates change with it, so the frontage stays matched.',
  },
}

const INSPECT: Record<Product, string> = {
  garage: 'The door turns see-through and the opener glows: its motor pulls a trolley along the rail above the door.',
  gate: 'X-ray: the gate motor, its ground track and the guide post that keeps the leaf upright.',
  pedestrian: 'X-ray: the two hinges on the left pillar and the latch on the right.',
  shutters: 'X-ray: the housing turns see-through to show the axle the slats roll onto, and the guide rails either side.',
  fence: 'X-ray: each post and the concrete footing below ground that holds it.',
}

type Mode = 'intro' | 'running' | 'done' | 'tour'

const Icon = {
  sound: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>,
  mute: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></svg>,
  prev: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>,
  next: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>,
  pause: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5.5" width="3.4" height="13" rx="1" /><rect x="13.6" y="5.5" width="3.4" height="13" rx="1" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  play: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>,
  moon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>,
  sun: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  reset: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>,
  exit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
}

/**
 * The circular countdown: read straight from the tour controller's clock
 * each frame (the ring is styled directly; only the seconds re-render).
 */
const RING = 2 * Math.PI * 15
function Countdown({ tour, durations, last }: { tour: React.MutableRefObject<{ index: number; start: number; elapsed: number; paused: boolean }>; durations: number[]; last: boolean }) {
  const ring = useRef<SVGCircleElement>(null)
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const t = tour.current
      const d = durations[t.index]
      if (d) {
        const elapsed = t.paused ? t.elapsed : performance.now() - t.start
        const p = Math.min(1, Math.max(0, elapsed / d))
        if (ring.current) ring.current.style.strokeDashoffset = String(RING * (1 - p))
        setSecs(Math.max(0, Math.ceil((d - elapsed) / 1000)))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [tour, durations])
  return (
    <div className="tour-timer" role="timer" aria-label={last ? `Introduction ends in ${secs} seconds` : `Next scene in ${secs} seconds`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" className="tour-timer-track" />
        <circle ref={ring} cx="18" cy="18" r="15" className="tour-timer-ring" strokeDasharray={RING} strokeDashoffset={RING} />
      </svg>
      <span className="tour-timer-text">{secs}s</span>
      <span className="tour-timer-label">{last ? 'Finish' : 'Next'}</span>
    </div>
  )
}

/**
 * "Design this" opens the real designer with the product the visitor is
 * looking at. A fence carries its real colour, finish and infill.
 */
function designHref(product: Product, fence: FenceStyle): string {
  const spec =
    product === 'fence'
      ? { productType: 'fence', colour: fence.colour, finish: fence.finish, infill: fence.infill }
      : { productType: { garage: 'sectional', gate: 'sliding-gate', pedestrian: 'pedestrian-gate', shutters: 'window-shutter' }[product] }
  return `/configure?spec=${encodeURIComponent(JSON.stringify(spec))}`
}

export default function DoorlinkWorld({
  onExit,
  arrival = false,
  revealed = true,
  onSceneReady,
  intro = false,
  businesses = [],
}: {
  onExit: () => void
  /** Entered through the homepage portal: start framed like the glimpse, settle once revealed. */
  arrival?: boolean
  revealed?: boolean
  onSceneReady?: () => void
  /** Play the guided introduction once the visitor arrives (first visit only). */
  intro?: boolean
  /** Real, approved businesses for the intro's quotes panel. Never invented. */
  businesses?: IntroBusiness[]
}) {
  const snapshot = useMemo(() => window.location.search.includes('snapshot'), [])
  const bus = useMemo(() => new CameraBus(), [])
  const maxTier = useMemo<Tier>(() => detectTier(), [])
  const [tier, setTier] = useState<Tier>(maxTier)
  const reduced = useMemo(prefersReducedMotion, [])
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<Mode>('intro')
  const [introLine, setIntroLine] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<IntroOverlay>(null)
  const toured = useRef(false)
  const [step, setStep] = useState(-1)
  const [caption, setCaption] = useState('A standard suburban home. One touch shows what Doorlink can do with it.')
  const [fading, setFading] = useState(false)
  const [xray, setXray] = useState(false)
  const [state, setState] = useState<WorldState>({ ...BEFORE, epoch: 0, night: false, fence: FENCE_STYLES[0], selected: null, inspect: null })
  const [aspect, setAspect] = useState(() => window.innerWidth / Math.max(1, window.innerHeight))
  useEffect(() => {
    const onResize = () => setAspect(window.innerWidth / Math.max(1, window.innerHeight))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const timers = useRef<number[]>([])
  const nightTimers = useRef<number[]>([])
  const xrayOpen = useRef(false)
  xrayOpen.current = xray

  const patch = useCallback((fn: (s: WorldState) => Partial<WorldState>) => setState((s) => ({ ...s, ...fn(s) })), [])
  const view = useCallback((name: string, duration?: number) => bus.send({ type: 'view', name, duration }), [bus])
  const later = (list: React.MutableRefObject<number[]>, steps: Array<[number, () => void]>) => {
    list.current.forEach(clearTimeout)
    list.current = steps.map(([at, fn]) => window.setTimeout(fn, at))
  }
  const fade = (fn: () => void) => {
    setFading(true)
    window.setTimeout(() => {
      fn()
      window.setTimeout(() => setFading(false), 140)
    }, reduced ? 0 : 380)
  }

  // The parent may hand a new onExit on every render; keep the latest without
  // re-running this effect (which would cancel the running sequence's timers).
  const exitRef = useRef(onExit)
  exitRef.current = onExit
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !xrayOpen.current && exitRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
      timers.current.forEach(clearTimeout)
      nightTimers.current.forEach(clearTimeout)
      bus.send({ type: 'spin', on: false })
      hush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pull back from the garage to the whole property once it has loaded.
  const onReady = useCallback(() => {
    setReady(true)
    onSceneReady?.()
    if (!arrival) window.setTimeout(() => bus.send({ type: 'view', name: 'hero' }), reduced ? 0 : 400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, reduced, arrival])

  // Through the portal: once the glimpse has dissolved, ease back to the property overview.
  useEffect(() => {
    if (arrival && revealed && ready && !snapshot) {
      const t = window.setTimeout(() => bus.send({ type: 'view', name: 'hero', duration: 1.6 }), 120)
      const u = intro && !toured.current ? window.setTimeout(runIntro, 1500) : 0
      return () => {
        window.clearTimeout(t)
        window.clearTimeout(u)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival, revealed, ready, snapshot, bus])

  /**
   * The guided introduction (scenes 2–8): one controller owns the camera,
   * captions, overlays, product state and countdown. Each scene declares the
   * whole world it shows, so arriving at it by its timer, Next, Previous or
   * a burst of presses always lands in the same consistent state; entering a
   * scene cancels everything the previous one scheduled. Pausing (or the
   * tab going to the background) stops the clock; resuming continues it.
   */
  const tour = useRef({ index: -1, timers: [] as number[], start: 0, elapsed: 0, paused: false })
  const [tourIndex, setTourIndex] = useState(-1)
  const [tourPaused, setTourPaused] = useState(false)
  const [voiceOn, setVoiceOn] = useState(() => voiceAvailable && !isMuted())
  const toggleVoice = () => {
    const on = !voiceOn
    setMuted(!on)
    setVoiceOn(on)
    if (on && introLine) say(introLine)
  }
  const set = (fn: (s: WorldState) => Partial<WorldState>) => () => patch(fn)
  const TOUR = useMemo(
    () => [
      { key: 'garage', view: 'garage', duration: 5500, lines: [[0, 'More than just garage doors. Explore, customise and visualise the perfect door for your property.']] as Array<[number, string]>, cues: [] as Array<[number, () => void]> },
      { key: 'gate', view: 'gate', duration: 4500, lines: [[0, 'From swing gates to sliding gates, we’ve got you covered.']] as Array<[number, string]>, cues: [[1200, set((s) => ({ open: { ...s.open, gate: true } }))]] as Array<[number, () => void]> },
      { key: 'fence', view: 'fence', duration: 3500, lines: [[0, 'And we don’t stop there.']] as Array<[number, string]>, cues: [[1400, set((s) => ({ open: { ...s.open, pedestrian: true } }))]] as Array<[number, () => void]> },
      { key: 'shutters', view: 'shutters', duration: 4500, lines: [[0, 'Explore roller shutters, fencing and more — all in one place.']] as Array<[number, string]>, cues: [[700, set((s) => ({ open: { ...s.open, shutters: false } }))], [3000, set((s) => ({ open: { ...s.open, shutters: true } }))]] as Array<[number, () => void]> },
      { key: 'market', view: 'overview', overlay: 'market' as IntroOverlay, duration: 6500, lines: [[0, 'Doorlink connects customers with businesses and skilled tradespeople. Compare quotes and choose with confidence.']] as Array<[number, string]>, cues: [] as Array<[number, () => void]> },
      { key: 'features', view: 'overview', overlay: 'features' as IntroOverlay, duration: 4500, lines: [[0, 'Design it. Visualise it. Compare it. Connect.']] as Array<[number, string]>, cues: [] as Array<[number, () => void]> },
      { key: 'reveal', view: 'reveal', duration: 5000, lines: [[0, 'Welcome to a smarter way forward.']] as Array<[number, string]>, cues: [[2300, () => { setIntroLine(null); setOverlay('logo'); say('Doorlink. Your vision. Our connection.') }]] as Array<[number, () => void]> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduced, bus]
  )
  /** The world each scene shows, whichever way it was reached. */
  const sceneState = (i: number, s: WorldState): Partial<WorldState> => ({
    upgraded: { garage: i >= 0, gate: i >= 1, fence: i >= 2, shutters: i >= 3 },
    open: { ...s.open, garage: i >= 1, gate: i >= 2, pedestrian: i >= 3, shutters: true },
  })
  const schedule = (i: number, from: number) => {
    const t = tour.current
    t.timers.forEach(clearTimeout)
    t.timers = []
    const sc = TOUR[i]
    const at = (ms: number, fn: () => void) => {
      if (ms > from || (ms === 0 && from === 0)) t.timers.push(window.setTimeout(fn, ms - from))
    }
    for (const [ms, text] of sc.lines) if (ms > 0) at(ms, () => (setIntroLine(text), say(text)))
    for (const [ms, fn] of sc.cues) at(ms, fn)
    at(sc.duration, () => goScene(i + 1))
    t.start = performance.now() - from
  }
  const goScene = (i: number, manual = false) => {
    const t = tour.current
    // Navigating while paused keeps the tour paused (with a fresh clock): the visitor is in control.
    const stayPaused = manual && t.paused
    t.timers.forEach(clearTimeout)
    t.timers = []
    if (i >= TOUR.length) return endIntro()
    if (i < 0) return
    const sc = TOUR[i]
    t.index = i
    t.paused = false
    setTourPaused(false)
    setTourIndex(i)
    setMode('tour')
    bus.send({ type: 'spin', on: false })
    patch((s) => ({ ...sceneState(i, s), selected: null, inspect: null, interactive: false }))
    setOverlay(sc.overlay ?? null)
    setIntroLine(sc.lines[0][1])
    say(sc.lines[0][1])
    view(sc.view, reduced ? undefined : 1.6)
    if (stayPaused) {
      t.paused = true
      t.elapsed = 0
      t.start = performance.now()
      setTourPaused(true)
    } else schedule(i, 0)
  }
  const pauseTour = () => {
    const t = tour.current
    if (t.paused || t.index < 0) return
    t.timers.forEach(clearTimeout)
    t.timers = []
    t.elapsed = performance.now() - t.start
    t.paused = true
    hush()
    setTourPaused(true)
    bus.send({ type: 'spin', on: false })
  }
  const resumeTour = () => {
    const t = tour.current
    if (!t.paused) return
    t.paused = false
    setTourPaused(false)
    schedule(t.index, t.elapsed)
  }
  // The clock never runs in a background tab.
  useEffect(() => {
    let auto = false
    const onVis = () => {
      if (document.hidden && !tour.current.paused && tour.current.index >= 0) {
        auto = true
        pauseTour()
      } else if (!document.hidden && auto) {
        auto = false
        resumeTour()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      tour.current.timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runIntro = () => {
    toured.current = true
    goScene(0)
  }

  const endIntro = () => {
    tour.current.timers.forEach(clearTimeout)
    tour.current.timers = []
    tour.current.index = -1
    tour.current.paused = false
    hush()
    setTourPaused(false)
    setTourIndex(-1)
    markIntroSeen()
    setIntroLine(null)
    setOverlay(null)
    bus.send({ type: 'spin', on: false })
    patch(() => ({ interactive: true }))
    finish()
  }

  const skipIntro = () => {
    later(timers, [])
    fade(() => setState((s) => ({ ...s, ...AFTER, epoch: s.epoch + 1 })))
    endIntro()
  }

  const replayIntro = () => {
    later(timers, [])
    tour.current.timers.forEach(clearTimeout)
    tour.current.timers = []
    setOverlay(null)
    fade(() => {
      setState((s) => ({ ...s, ...BEFORE, epoch: s.epoch + 1, selected: null, inspect: null, night: false }))
      view('hero')
    })
    setMode('tour')
    setTourIndex(-1)
    setIntroLine('Back to the start…')
    later(timers, [[reduced ? 300 : 1300, runIntro]])
  }

  const finish = () => {
    later(timers, [])
    setMode('done')
    setStep(STEPS.length)
    setCaption('Your upgraded property. Tap a product to operate it.')
    view('overview')
  }

  const runSequence = () => {
    setMode('running')
    setStep(0)
    patch(() => ({ selected: null, inspect: null, interactive: false }))
    const at = (ms: number) => (reduced ? Math.round(ms * 0.8) : ms)
    later(timers, [
      [0, () => {
        setCaption('Fitting a timber-look sectional garage door…')
        view('garage')
        patch((s) => ({ upgraded: { ...s.upgraded, garage: true }, open: { ...s.open, garage: false } }))
      }],
      [at(5800), () => {
        setStep(1)
        setCaption('Installing an automated sliding gate between new pillars…')
        view('gate')
        patch((s) => ({ upgraded: { ...s.upgraded, gate: true } }))
      }],
      [at(8200), () => {
        setStep(2)
        setCaption('Replacing the old pickets with a matching slat fence and pedestrian gate…')
        view('fence')
        patch((s) => ({ upgraded: { ...s.upgraded, fence: true } }))
      }],
      [at(12200), () => {
        setStep(3)
        setCaption('Fitting roller shutters to the front windows…')
        view('shutters')
        patch((s) => ({ upgraded: { ...s.upgraded, shutters: true }, open: { ...s.open, shutters: true } }))
      }],
      [at(13500), () => patch((s) => ({ open: { ...s.open, shutters: false } }))],
      [at(16000), () => {
        setStep(4)
        setCaption('Everything automated, working together.')
        view('hero')
        patch((s) => ({ open: { ...s.open, garage: true } }))
      }],
      [at(16500), () => patch((s) => ({ open: { ...s.open, gate: true } }))],
      [at(17000), () => patch((s) => ({ open: { ...s.open, pedestrian: true } }))],
      [at(17500), () => patch((s) => ({ open: { ...s.open, shutters: true } }))],
      [at(21000), () => {
        patch(() => ({ interactive: true }))
        finish()
      }],
    ])
  }

  const transform = () => {
    if (mode === 'intro') return runSequence()
    // Replay: cut back to the original property, then run it again.
    later(timers, [])
    fade(() => {
      setState((s) => ({ ...s, ...BEFORE, epoch: s.epoch + 1, selected: null, inspect: null }))
      view('hero')
    })
    setMode('running')
    setStep(-1)
    setCaption('Back to the original property…')
    later(timers, [[reduced ? 300 : 1300, runSequence]])
  }

  const skip = () => {
    later(timers, [])
    fade(() => setState((s) => ({ ...s, ...AFTER, epoch: s.epoch + 1 })))
    finish()
  }

  const toggle = (p: Product) =>
    patch((s) => {
      if (p === 'fence') return {}
      const key = p as keyof WorldState['open']
      return { open: { ...s.open, [key]: !s.open[key] } }
    })

  const pick = (p: Product) => {
    if (state.selected !== p) view(PRODUCT_VIEW[p])
    toggle(p)
    patch((s) => ({ selected: p, inspect: s.inspect === p ? p : null }))
  }

  const inspect = (p: Product) => {
    const on = state.inspect !== p
    patch(() => ({ inspect: on ? p : null }))
    if (on) view(p === 'gate' ? 'gateInside' : PRODUCT_VIEW[p])
  }

  const toggleNight = () => {
    const night = !state.night
    fade(() => patch(() => ({ night })))
    setCaption(night ? 'Evening: the lights come on and the property secures itself.' : 'Daytime.')
    if (!state.upgraded.gate) return
    later(
      nightTimers,
      night
        ? [
            [900, () => patch((s) => ({ open: { ...s.open, gate: false } }))],
            [1400, () => patch((s) => ({ open: { ...s.open, pedestrian: false } }))],
            [1900, () => patch((s) => ({ open: { ...s.open, shutters: false } }))],
            [2400, () => patch((s) => ({ open: { ...s.open, garage: false } }))],
          ]
        : [[900, () => patch((s) => ({ open: { ...s.open, shutters: true } }))]]
    )
  }

  const reset = () => {
    patch(() => ({ selected: null, inspect: null }))
    view(mode === 'done' ? 'overview' : 'hero')
  }

  const selected = state.selected
  const info = selected ? INFO[selected] : null
  const openKey = selected && selected !== 'fence' ? (selected as keyof WorldState['open']) : null

  return (
    <div className={`world-root ${arrival ? 'is-arrival' : ''} ${snapshot ? 'is-clean' : ''}`} role="dialog" aria-modal="true" aria-label="Doorlink">
      <div className="world-canvas">
        <WorldScene
          bus={bus}
          tier={tier}
          maxTier={maxTier}
          onTier={setTier}
          paused={xray}
          onReady={onReady}
          state={state}
          onPick={pick}
          aspect={aspect}
          initialView={arrival ? 'arrive' : 'start'}
        />
      </div>
      {!ready && !arrival && <div className="xray-loading">Building the property…</div>}
      <div className={`world-fade ${fading ? 'is-on' : ''}`} aria-hidden="true" />

      <header className="world-top">
        <div className="world-brand min-w-0">
          <span className="world-mark" aria-hidden="true">DL</span>
          <div className="min-w-0">
            <p className="world-eyebrow">Doorlink</p>
            <p className="world-sub">Garage doors, gates, fencing and shutters on one property · sample products</p>
          </div>
        </div>
        <div className="world-actions">
          {mode !== 'tour' && (
            <button type="button" className="world-btn" onClick={replayIntro} aria-label="Replay the introduction">
              {Icon.play}
              <span className="world-btn-label">Intro</span>
            </button>
          )}
          <button type="button" className="world-btn" onClick={toggleNight} disabled={mode === 'tour'} aria-pressed={state.night} aria-label={state.night ? 'Switch to day' : 'Switch to night'}>
            {state.night ? Icon.sun : Icon.moon}
            <span className="world-btn-label">{state.night ? 'Day' : 'Night'}</span>
          </button>
          <button type="button" className="world-btn" onClick={reset} aria-label="Reset view">
            {Icon.reset}
            <span className="world-btn-label">Reset view</span>
          </button>
          <button type="button" className="world-btn is-primary" onClick={onExit} aria-label="Exit">
            {Icon.exit}
            <span className="world-btn-label">Exit</span>
          </button>
        </div>
      </header>

      {info && selected && (
        <aside className="world-card" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="world-kicker">{state.inspect === selected ? 'X-ray view' : 'Doorlink product'}</p>
              <p className="xray-card-title">{info.title}</p>
            </div>
            <button type="button" className="world-close" aria-label="Close" onClick={() => patch(() => ({ selected: null, inspect: null }))}>
              {Icon.close}
            </button>
          </div>
          <p className="world-body">{state.inspect === selected ? INSPECT[selected] : info.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {openKey && info.verbs && (
              <button type="button" className="xray-chip is-active" onClick={() => toggle(selected)}>
                {state.open[openKey] ? info.verbs[1] : info.verbs[0]}
              </button>
            )}
            <button type="button" className={`xray-chip ${state.inspect === selected ? 'is-active' : ''}`} aria-pressed={state.inspect === selected} onClick={() => inspect(selected)}>
              X-ray
            </button>
            <Link href={designHref(selected, state.fence)} className="xray-chip">
              Design this
            </Link>
            {selected === 'garage' && (
              <button type="button" className="xray-chip" onClick={() => setXray(true)}>
                Full X-ray garage
              </button>
            )}
          </div>
          {selected === 'fence' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {FENCE_STYLES.map((f) => (
                <button key={f.id} type="button" className={`xray-chip ${state.fence.id === f.id ? 'is-active' : ''}`} aria-pressed={state.fence.id === f.id} onClick={() => patch(() => ({ fence: f }))}>
                  <span className="world-swatch" style={{ background: colourHex(f.colour) }} aria-hidden="true" />
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </aside>
      )}

      {mode === 'tour' && <IntroCaption text={introLine} scene={Math.max(0, tourIndex) + 1} placement="world" />}
      {mode === 'tour' && tourIndex >= 0 && (
        <>
          <Countdown tour={tour} durations={TOUR.map((t) => t.duration)} last={tourIndex === TOUR.length - 1} />
          <div className="tour-nav" role="group" aria-label="Introduction controls">
            {voiceAvailable && (
              <button type="button" className="tour-arrow" onClick={toggleVoice} aria-pressed={voiceOn} aria-label={voiceOn ? 'Mute narration' : 'Turn narration on'}>
                {voiceOn ? Icon.sound : Icon.mute}
              </button>
            )}
            <button type="button" className="tour-arrow" onClick={() => goScene(tour.current.index - 1, true)} disabled={tourIndex === 0} aria-label="Previous scene">
              {Icon.prev}
            </button>
            <button type="button" className="tour-arrow" onClick={tourPaused ? resumeTour : pauseTour} aria-label={tourPaused ? 'Resume introduction' : 'Pause introduction'}>
              {tourPaused ? Icon.play : Icon.pause}
            </button>
            <button type="button" className="tour-arrow is-next" onClick={() => goScene(tour.current.index + 1, true)} aria-label={tourIndex === TOUR.length - 1 ? 'Finish introduction' : 'Next scene'}>
              {tourIndex === TOUR.length - 1 ? Icon.check : Icon.next}
            </button>
          </div>
        </>
      )}
      <IntroOverlays overlay={overlay} onContinue={endIntro} businesses={businesses} />

      <div className={`world-bottom ${mode === 'tour' ? 'is-tour' : ''}`}>
        {mode === 'tour' ? (
          <button type="button" className="world-btn" onClick={skipIntro}>
            Skip intro
          </button>
        ) : (
        <>
        <div className="world-caption" aria-live="polite">
          <p>{caption}</p>
          {mode !== 'intro' && (
            <div className="world-steps" aria-hidden="true">
              {STEPS.map((s, i) => (
                <span key={s} className={i < step || mode === 'done' ? 'is-done' : i === step ? 'is-now' : ''} title={s} />
              ))}
            </div>
          )}
        </div>
        {mode === 'running' ? (
          <button type="button" className="world-btn" onClick={skip}>
            Skip to the finished property
          </button>
        ) : (
          <button type="button" className={mode === 'intro' ? 'world-cta' : 'world-btn'} onClick={transform} disabled={!ready}>
            {mode === 'intro' ? 'Transform my property' : 'Replay the transformation'}
          </button>
        )}
        </>
        )}
      </div>

      {xray && (
        <Suspense fallback={<div className="xray-root"><div className="xray-loading">Preparing the X-ray view…</div></div>}>
          <XRayGarage onExit={() => setXray(false)} />
        </Suspense>
      )}
    </div>
  )
}
