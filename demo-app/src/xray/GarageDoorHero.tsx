import { NavigationLink as Link } from '@/components/ui/NavigationLink'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { GarageDoorScene } from '@/components/garage-door/GarageDoorScene'
import { useDoorDrag } from '@/components/garage-door/useDoorDrag'
import './xray.css'
import '../world/world.css'

/**
 * Demo copy of src/components/garage-door/GarageDoorHero.tsx: the same
 * hero and door, plus the X-Ray Garage invitation once the door is fully
 * open. The X-ray experience itself loads only when someone opens it.
 */
const XRayGarage = lazy(() => import('./XRayGarage'))
const DoorlinkWorld = lazy(() => import('../world/DoorlinkWorld'))

const SESSION_KEY = 'doorlink:garage-door-intro-seen'

export function GarageDoorHero({ poweredBy }: { poweredBy: string | null }) {
  const [xray, setXray] = useState(false)
  const [world, setWorld] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [hasPlayed, setHasPlayed] = useState(false)

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

  const replay = () => {
    window.sessionStorage.removeItem(SESSION_KEY)
    setHasPlayed(false)
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

        <div className="garage-door-sim">
          <GarageDoorScene
            progress={progress}
            isDragging={isDragging}
            dragHandlers={dragHandlers}
            poweredBy={poweredBy}
          />
          {fullyOpen && !xray && !world && (
            <div className="xray-invite">
              <p>Doorlink is more than garage doors.</p>
              <button type="button" className="xray-button world-explore" onClick={() => setWorld(true)}>
                Explore Doorlink World
              </button>
              <button type="button" className="world-link" onClick={() => setXray(true)}>
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
      {xray && (
        <Suspense fallback={<div className="xray-root"><div className="xray-loading">Preparing the X-ray view…</div></div>}>
          <XRayGarage onExit={() => setXray(false)} />
        </Suspense>
      )}
      {world && (
        <Suspense fallback={<div className="world-root"><div className="xray-loading">Building the property…</div></div>}>
          <DoorlinkWorld onExit={() => setWorld(false)} />
        </Suspense>
      )}
    </section>
  )
}
