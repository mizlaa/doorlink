import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { AutomatedDoorsIntro } from '@/components/garage-door/AutomatedDoorsIntro'
import { GarageDoorPanels } from '@/components/garage-door/GarageDoorPanels'
import { prefersReducedMotion } from '../three/quality'

/**
 * The homepage portal: as the hero door rises, a luminous doorway appears
 * on the garage's back wall with a glimpse of Doorlink World beyond it.
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

function PortalGlimpse({ progress }: { progress: number }) {
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
  if (progress < 0.2) return null
  return (
    <div className="portal" style={{ ['--reveal' as string]: smooth((progress - 0.25) / 0.7) }} aria-hidden="true">
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
export function PortalGarageScene({ progress, isDragging, dragHandlers, poweredBy }: SceneProps) {
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
          <PortalGlimpse progress={progress} />
          {poweredBy && <AutomatedDoorsIntro progress={progress} name={poweredBy} />}
          <GarageDoorPanels progress={progress} />
        </div>
      </div>
      <div className="garage-door-fade" aria-hidden="true" />
    </div>
  )
}

/**
 * The journey: a copy of the glimpse that grows from the portal's place on
 * the page to the whole screen, while the hero dollies in behind it. Holds
 * (gently breathing, never black) until the world is ready, then fades.
 */
export function PortalTravel({
  from,
  sim,
  ready,
  onFull,
  onDone,
}: {
  from: DOMRect
  sim: HTMLElement | null
  ready: boolean
  onFull: () => void
  onDone: () => void
}): ReactNode {
  const el = useRef<HTMLDivElement>(null)
  const full = useRef(false)
  const reduced = useMemo(prefersReducedMotion, [])
  const small = typeof window !== 'undefined' && window.innerWidth < 720
  const src = useMemo(glimpseFor, [])

  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    const grow = reduced ? 450 : small ? 900 : 1300
    const easing = 'cubic-bezier(0.65, 0, 0.35, 1)'
    const animation = node.animate(
      [
        { top: `${from.top}px`, left: `${from.left}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: '10px' },
        { top: '0px', left: '0px', width: '100vw', height: '100vh', borderRadius: '0px' },
      ],
      { duration: grow, delay: reduced ? 0 : 180, easing, fill: 'forwards' }
    )
    // The camera moving towards the portal: the hero scales up around it.
    let dolly: Animation | null = null
    if (sim && !reduced) {
      const box = sim.getBoundingClientRect()
      sim.style.transformOrigin = `${from.left + from.width / 2 - box.left}px ${from.top + from.height / 2 - box.top}px`
      dolly = sim.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }], { duration: grow + 180, easing, fill: 'forwards' })
    }
    animation.onfinish = () => {
      full.current = true
      node.classList.add('is-full')
      onFull()
    }
    return () => {
      animation.cancel()
      dolly?.cancel()
      if (sim) sim.style.transformOrigin = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Once the world is ready behind it, the glimpse dissolves into the live scene.
  useLayoutEffect(() => {
    const node = el.current
    if (!node || !ready) return
    const fade = () => {
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
    }, 60)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  return (
    <div
      ref={el}
      className={`portal-travel ${ready ? '' : 'is-waiting'}`}
      style={{ top: from.top, left: from.left, width: from.width, height: from.height, borderRadius: 10 }}
      aria-hidden="true"
    >
      <img src={src} alt="" />
      <div className="portal-travel-glow" />
    </div>
  )
}
