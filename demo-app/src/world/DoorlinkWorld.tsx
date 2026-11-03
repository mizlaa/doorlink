import '../xray/xray.css'
import './world.css'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CameraBus } from '../three/CameraRig'
import { detectTier, prefersReducedMotion, type Tier } from '../three/quality'
import { AFTER, BEFORE, FENCE_STYLES, PRODUCT_VIEW, WorldScene, type Product, type WorldState } from './WorldScene'

const XRayGarage = lazy(() => import('../xray/XRayGarage'))

/**
 * Doorlink World: the whole property in one scene, opened from the
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

type Mode = 'intro' | 'running' | 'done'

const Icon = {
  moon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>,
  sun: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  reset: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>,
  exit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
}

export default function DoorlinkWorld({
  onExit,
  arrival = false,
  revealed = true,
  onSceneReady,
}: {
  onExit: () => void
  /** Entered through the homepage portal: start framed like the glimpse, settle once revealed. */
  arrival?: boolean
  revealed?: boolean
  onSceneReady?: () => void
}) {
  const snapshot = useMemo(() => window.location.search.includes('snapshot'), [])
  const bus = useMemo(() => new CameraBus(), [])
  const maxTier = useMemo<Tier>(() => detectTier(), [])
  const [tier, setTier] = useState<Tier>(maxTier)
  const reduced = useMemo(prefersReducedMotion, [])
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<Mode>('intro')
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
  const view = useCallback((name: string) => bus.send({ type: 'view', name }), [bus])
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

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !xrayOpen.current && onExit()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
      timers.current.forEach(clearTimeout)
      nightTimers.current.forEach(clearTimeout)
    }
  }, [onExit])

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
      const t = window.setTimeout(() => bus.send({ type: 'view', name: 'hero' }), 120)
      return () => window.clearTimeout(t)
    }
  }, [arrival, revealed, ready, snapshot, bus])

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
    <div className={`world-root ${arrival ? 'is-arrival' : ''} ${snapshot ? 'is-clean' : ''}`} role="dialog" aria-modal="true" aria-label="Doorlink World">
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
            <p className="world-eyebrow">Doorlink World</p>
            <p className="world-sub">Garage doors, gates, fencing and shutters on one property · sample products</p>
          </div>
        </div>
        <div className="world-actions">
          <button type="button" className="world-btn" onClick={toggleNight} aria-pressed={state.night} aria-label={state.night ? 'Switch to day' : 'Switch to night'}>
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
                  <span className="world-swatch" style={{ background: f.color }} aria-hidden="true" />
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </aside>
      )}

      <div className="world-bottom">
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
      </div>

      {xray && (
        <Suspense fallback={<div className="xray-root"><div className="xray-loading">Preparing the X-ray view…</div></div>}>
          <XRayGarage onExit={() => setXray(false)} />
        </Suspense>
      )}
    </div>
  )
}
