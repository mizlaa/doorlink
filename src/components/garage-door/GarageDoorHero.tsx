'use client'

import { NavigationLink as Link } from '@/components/ui/NavigationLink'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { GarageDoorScene } from './GarageDoorScene'
import { useDoorDrag } from './useDoorDrag'
import { FEATURE_3D_V2 } from '@/lib/feature-flags'
import { PortalGarageScene, PortalTravel } from '@/components/doorlink-world/Portal'
import { HOME_LINES, IntroCaption, introSeen, type IntroBusiness } from '@/components/doorlink-world/Intro'
import { unlockVoice } from '@/components/doorlink-world/voice'
import '@/components/doorlink-world/world.css'
import '@/components/xray/xray.css'

// Loaded only when someone enters the experience (or opens the X-ray).
const DoorlinkWorld = lazy(() => import('@/components/doorlink-world/DoorlinkWorld'))
const XRayGarage = lazy(() => import('@/components/xray/XRayGarage'))

const SESSION_KEY = 'doorlink:garage-door-intro-seen'

export function GarageDoorHero({ poweredBy, businesses = [] }: { poweredBy: string | null; businesses?: IntroBusiness[] }) {
  const [mounted, setMounted] = useState(false)
  const [hasPlayed, setHasPlayed] = useState(false)

  // Experience state (used only when the 3D flag is on).
  const [xray, setXray] = useState(false)
  const [world, setWorld] = useState(false)
  const [trip, setTrip] = useState<DOMRect | null>(null)
  const [tripFull, setTripFull] = useState(false)
  const [worldReady, setWorldReady] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const sim = useRef<HTMLDivElement>(null)
  const [playIntro, setPlayIntro] = useState(false)
  const [homeLine, setHomeLine] = useState(-1)
  const homeTimers = useRef<number[]>([])
  useEffect(() => () => homeTimers.current.forEach(clearTimeout), [])

  const markPlayed = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_KEY, '1')
    }
  }, [])

  const { progress, isDragging, open, toggle, dragHandlers } = useDoorDrag({
    onOpened: markPlayed,
  })

  useEffect(() => {
    setMounted(true)
    setHasPlayed(window.sessionStorage.getItem(SESSION_KEY) === '1')
  }, [])

  // Scene 1 captions appear as the door rises, on a first visit only.
  useEffect(() => {
    if (!FEATURE_3D_V2 || homeLine >= 0 || progress < 0.04 || introSeen()) return
    setHomeLine(0)
    homeTimers.current = [window.setTimeout(() => setHomeLine(1), 2300), window.setTimeout(() => setHomeLine(2), 4800)]
  }, [progress > 0.04]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the world's code while the door is still rising, so entering is instant.
  useEffect(() => {
    if (FEATURE_3D_V2 && progress > 0.15) void import('@/components/doorlink-world/DoorlinkWorld')
  }, [progress > 0.15]) // eslint-disable-line react-hooks/exhaustive-deps

  const replay = () => {
    window.sessionStorage.removeItem(SESSION_KEY)
    setHasPlayed(false)
  }

  const enter = () => {
    unlockVoice()
    setPlayIntro(!introSeen())
    const frame = document.querySelector('.garage-door-opening')
    setWorldReady(false)
    setRevealed(false)
    setTripFull(false)
    if (frame) setTrip(frame.getBoundingClientRect())
    else setTripFull(true)
    setWorld(true)
  }

  const leave = () => {
    setWorld(false)
    setTrip(null)
    setRevealed(false)
  }

  if (mounted && hasPlayed && progress === 0) {
    return (
      <section className="garage-door-replay" aria-label="Doorlink introduction">
        <div>
          <p className="garage-door-kicker">{poweredBy ? `POWERED BY ${poweredBy.toUpperCase()}` : 'DOORLINK'}</p>
          <p className="garage-door-replay-copy">Your workspace is ready.</p>
        </div>
        <button type="button" onClick={replay} className="garage-door-replay-button">
          <span className="garage-door-replay-icon" aria-hidden="true">↟</span>
          Replay door intro
        </button>
      </section>
    )
  }

  const isOpen = progress > 0.5
  const fullyOpen = progress >= 0.999 && !isDragging

  return (
    <section className="garage-door-hero">
      <div className="garage-door-hero-inner">
        <div className="garage-door-hero-copy">
          <h1>
            Everything for your door.
            <span>One connected system.</span>
          </h1>
          <div className="garage-door-hero-actions">
            <Link href="/request-technician" className="garage-door-primary-action">
              Hire a pro <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/configure" className="garage-door-secondary-action">
              Design yours
            </Link>
          </div>
        </div>

        <div className="garage-door-sim" ref={sim}>
          {FEATURE_3D_V2 ? (
            <PortalGarageScene
              progress={progress}
              isDragging={isDragging}
              dragHandlers={dragHandlers}
              poweredBy={poweredBy}
              paused={world || xray}
            />
          ) : (
            <GarageDoorScene
              progress={progress}
              isDragging={isDragging}
              dragHandlers={dragHandlers}
              poweredBy={poweredBy}
            />
          )}
          {FEATURE_3D_V2 && homeLine >= 0 && progress >= 0.04 && !world && (
            <IntroCaption text={HOME_LINES[homeLine]} scene={0} placement="hero" />
          )}
          {FEATURE_3D_V2 && fullyOpen && !xray && !world && (
            <div className="portal-invite">
              <p className="portal-invite-title">YOUR WORLD. YOUR DESIGN.</p>
              <button type="button" className="portal-invite-button" onClick={enter}>
                Enter Doorlink
              </button>
              <button type="button" className="portal-invite-link" onClick={() => setXray(true)}>
                or X-ray this garage door
              </button>
            </div>
          )}
          <div className="garage-door-sim-bar">
            <p className={`garage-door-hint ${isDragging ? 'is-hidden' : ''}`}>
              <svg viewBox="0 0 16 24" width="14" height="22" aria-hidden="true" focusable="false">
                <path
                  d="M8 1v22M3.5 5.5 8 1l4.5 4.5M3.5 18.5 8 23l4.5-4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {isOpen ? 'DRAG DOWN TO CLOSE' : 'DRAG UP TO OPEN'}
            </p>
            <button type="button" onClick={toggle} className="garage-door-open-button">
              {isOpen ? 'CLOSE THE DOOR' : 'OPEN THE DOOR'}{' '}
              <span aria-hidden="true">{isOpen ? '↓' : '↑'}</span>
            </button>
          </div>
        </div>
      </div>
      <button type="button" onClick={open} className="sr-only">
        Open the door
      </button>

      {FEATURE_3D_V2 && xray && (
        <Suspense fallback={<div className="xray-root"><div className="xray-loading">Preparing the X-ray view…</div></div>}>
          <XRayGarage onExit={() => setXray(false)} />
        </Suspense>
      )}
      {FEATURE_3D_V2 && world && tripFull && (
        <Suspense fallback={null}>
          <DoorlinkWorld
            onExit={leave}
            arrival
            revealed={revealed || !trip}
            intro={playIntro}
            businesses={businesses}
            onSceneReady={() => setWorldReady(true)}
          />
        </Suspense>
      )}
      {FEATURE_3D_V2 && world && trip && !revealed && (
        <IntroCaption text={playIntro ? HOME_LINES[Math.max(homeLine, 2)] : 'Arriving in Doorlink…'} scene={0} placement="fixed" />
      )}
      {FEATURE_3D_V2 && world && trip && !revealed && (
        <PortalTravel
          from={trip}
          sim={sim.current}
          ready={worldReady}
          onFull={() => setTripFull(true)}
          onDone={() => setRevealed(true)}
        />
      )}
    </section>
  )
}
