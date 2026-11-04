'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortalRenderer } from './portalGL'
import { AutomatedDoorsIntro } from '@/components/garage-door/AutomatedDoorsIntro'
import { GarageDoorPanels } from '@/components/garage-door/GarageDoorPanels'
import { prefersReducedMotion } from '@/components/three-v2/quality'

/**
 * The homepage portal: as the hero door rises, a luminous doorway appears
 * on the garage's back wall with a glimpse of Doorlink beyond it.
 * Entering grows that doorway to fill the screen; the live world mounts
 * underneath, framed exactly like the glimpse, and the glimpse dissolves
 * into it. Pure CSS on the homepage: no WebGL until someone enters.
 */

const WIDE = '/images/world/glimpse-wide.webp'
const TALL = '/images/world/glimpse-tall.webp'
export const glimpseFor = () => (window.innerWidth < window.innerHeight ? TALL : WIDE)

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/** Where the portal sits in the garage opening, in that element's CSS pixels. */
function diskIn(w: number, h: number) {
  const radius = Math.min(w * 0.3, h * 0.4)
  return { x: w * 0.5, y: h * 0.45, radius, zoom: (0.62 * Math.min(w, h)) / radius }
}
/** Image pixels per canvas pixel when the glimpse covers a w × h box (1600 × 950 source). */
const coverScale = (w: number, h: number) => Math.min(1600 / w, 950 / h)

function CssPortal({ particles }: { particles: Array<Record<string, string>> }) {
  return (
    <>
      <div className="portal-spill" />
      <div className="portal-frame">
        <picture>
          <source media="(orientation: portrait)" srcSet={TALL} />
          <img className="portal-glimpse" src={WIDE} alt="" draggable={false} decoding="async" />
        </picture>
        <div className="portal-veil" />
        <div className="portal-sheen" />
        <div className="portal-particles">
          {particles.map((style, i) => (
            <i key={i} style={style} />
          ))}
        </div>
      </div>
    </>
  )
}

function PortalGlimpse({ progress, paused }: { progress: number; paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const reveal = useRef(0)
  reveal.current = smooth((progress - 0.25) / 0.7)
  const [fallback, setFallback] = useState(false)
  const show = progress >= 0.2
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: `${6 + ((i * 37) % 88)}%`,
        animationDelay: `${(i * 0.43) % 6}s`,
        animationDuration: `${5 + (i % 4)}s`,
        ['--drift' as string]: `${((i % 5) - 2) * 6}px`,
      })),
    []
  )
  useEffect(() => {
    const el = canvas.current
    if (!show || paused || fallback || !el) return
    const renderer = createPortalRenderer(el, glimpseFor(), 1.5)
    if (!renderer) {
      setFallback(true)
      return
    }
    const reduced = prefersReducedMotion()
    let raf = 0
    let onScreen = true
    const observer = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting))
    observer.observe(el)
    const t0 = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!onScreen || document.hidden) return
      renderer.resize()
      const d = diskIn(el.clientWidth, el.clientHeight)
      const time = reduced ? 2 : (now - t0) / 1000
      renderer.draw({ centerX: d.x, centerY: d.y, radius: d.radius, travel: 0, reveal: reveal.current, zoom: d.zoom, blur: 0, spin: time * 0.3 }, time)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      renderer.destroy()
    }
  }, [show, paused, fallback])
  if (!show) return null
  return (
    <div className={`portal ${fallback ? '' : 'is-gl'}`} style={{ ['--reveal' as string]: reveal.current }} aria-hidden="true">
      {fallback ? <CssPortal particles={particles} /> : <canvas ref={canvas} className="portal-canvas" />}
    </div>
  )
}

interface SceneProps {
  progress: number
  poweredBy: string | null
  isDragging: boolean
  dragHandlers: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
    onPointerUp: () => void
    onPointerCancel: () => void
  }
}

/** The app's GarageDoorScene, unchanged, with the portal behind the panels. */
export function PortalGarageScene({ progress, isDragging, dragHandlers, poweredBy, paused = false }: SceneProps & { paused?: boolean }) {
  return (
    <div className={`garage-door-scene ${isDragging ? 'is-dragging' : ''}`} {...dragHandlers} role="group" aria-label="Interactive automated garage door">
      <div className="garage-door-stage">
        <img
          className="garage-door-plate"
          src="/images/simulator/exterior-1534.webp"
          srcSet="/images/simulator/exterior-960.webp 960w, /images/simulator/exterior-1534.webp 1534w"
          sizes="(min-width: 1280px) 1248px, 100vw"
          width={1534}
          height={686}
          alt=""
          draggable={false}
          decoding="async"
          fetchPriority="high"
        />
        <div className="garage-door-opening">
          <div className="garage-door-interior" aria-hidden="true" />
          <PortalGlimpse progress={progress} paused={paused} />
          {poweredBy && <AutomatedDoorsIntro progress={progress} name={poweredBy} />}
          <GarageDoorPanels progress={progress} />
        </div>
      </div>
      <div className="garage-door-fade" aria-hidden="true" />
    </div>
  )
}

/**
 * The journey: the swirl leaves the garage, accelerates towards the viewer
 * and opens past the edges of the screen with a radial motion blur, while
 * the page dims and the hero dollies in. It lands on the full-screen
 * glimpse and holds there (never black) until the world is ready beneath,
 * then dissolves into it.
 */
export function PortalTravel({
  from,
  sim,
  ready,
  onFull,
  onDone,
}: {
  /** The garage opening, in viewport pixels. */
  from: DOMRect
  sim: HTMLElement | null
  ready: boolean
  onFull: () => void
  onDone: () => void
}): ReactNode {
  const canvas = useRef<HTMLCanvasElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const full = useRef(false)
  const [fallback, setFallback] = useState(false)
  const reduced = useMemo(prefersReducedMotion, [])
  const src = useMemo(glimpseFor, [])

  useLayoutEffect(() => {
    const el = canvas.current
    const heavy = window.innerWidth * window.innerHeight * (window.devicePixelRatio || 1) ** 2 > 3.5e6
    const renderer = el ? createPortalRenderer(el, src, heavy ? 1.25 : 1.5) : null
    const W = window.innerWidth
    const H = window.innerHeight
    const small = W < 720
    const duration = reduced ? 550 : small ? 1700 : 2100
    const disk = diskIn(from.width, from.height)
    const start = { x: from.left + disk.x, y: from.top + disk.y, r: disk.radius }
    const end = Math.hypot(W, H) * 1.15
    const zoom0 = disk.zoom * (coverScale(from.width, from.height) / coverScale(W, H))
    let dolly: Animation | null = null
    if (sim && !reduced) {
      const box = sim.getBoundingClientRect()
      sim.style.transformOrigin = `${start.x - box.left}px ${start.y - box.top}px`
      dolly = sim.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.9)' }], { duration, easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)', fill: 'forwards' })
    }
    if (!renderer) {
      setFallback(true)
      const t = window.setTimeout(() => {
        full.current = true
        onFull()
      }, duration)
      return () => {
        window.clearTimeout(t)
        dolly?.cancel()
      }
    }
    const t0 = performance.now()
    let raf = 0
    let last = t0
    let spin = 1.2
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const t = Math.min(1, (now - t0) / duration)
      // Integrate the swirl's speed so its acceleration is smooth, never a jump.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!reduced) spin += dt * (0.3 + t * t * 3.6)
      // While holding on the glimpse for the world to load, drift slowly forward.
      const hold = Math.max(0, (now - t0 - duration) / 1000)
      // Slow pull at first, then a rush through: radius and depth grow geometrically.
      const accel = t < 1 ? t * t * (2.2 - 1.2 * t) : 1
      const move = t * t * (3 - 2 * t)
      renderer.resize()
      renderer.draw(
        {
          centerX: start.x + (W / 2 - start.x) * move,
          centerY: start.y + (H / 2 - start.y) * move,
          radius: start.r * Math.pow(end / start.r, accel),
          travel: t,
          reveal: 1,
          zoom: zoom0 * Math.pow(1 / zoom0, accel) * (1 - Math.min(0.04, hold * 0.012)),
          blur: reduced ? 0 : Math.sin(Math.PI * t) * 1.4,
          spin,
        },
        reduced ? 2 : (now - t0) / 1000 + 4
      )
      if (t >= 1 && !full.current) {
        full.current = true
        onFull()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      renderer.destroy()
      dolly?.cancel()
      if (sim) sim.style.transformOrigin = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Once the world is ready behind it, the glimpse dissolves into the live scene.
  useEffect(() => {
    const node = root.current
    if (!node || !ready) return
    let done = false
    const fade = () => {
      if (done) return
      done = true
      const a = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 200 : 700, easing: 'ease-out', fill: 'forwards' })
      a.onfinish = onDone
    }
    if (full.current) {
      fade()
      return
    }
    const timer = window.setInterval(() => {
      if (full.current) {
        window.clearInterval(timer)
        fade()
      }
    }, 50)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  return (
    <div ref={root} className={`portal-travel ${reduced ? 'is-reduced' : ''}`} aria-hidden="true">
      <div className="portal-dim" />
      {fallback ? <img src={src} alt="" className="portal-travel-fallback" /> : <canvas ref={canvas} className="portal-travel-canvas" />}
    </div>
  )
}
