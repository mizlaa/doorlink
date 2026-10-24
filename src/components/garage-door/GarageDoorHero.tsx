'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { GarageDoorScene } from './GarageDoorScene'
import { useDoorDrag } from './useDoorDrag'

const SESSION_KEY = 'doorlink:garage-door-intro-seen'

export function GarageDoorHero() {
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
          <p className="garage-door-kicker">DOORLINK / AUTOMATED DOORS &amp; GATES</p>
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

  return (
    <section className="garage-door-hero">
      <div className="garage-door-hero-inner">
        <div className="garage-door-hero-copy">
          <div>
            <p className="garage-door-kicker">DOORLINK / TRADE PLATFORM</p>
            <h1>
              Everything for your door.
              <span>One connected system.</span>
            </h1>
          </div>
          <div>
            <p className="garage-door-hero-description">
              Identify products, find the right professional, and get the manual you need for garage doors,
              gates, shutters and access systems.
            </p>
            <div className="garage-door-hero-actions">
              <Link href="/request-technician" className="garage-door-primary-action">
                Find a professional <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/configure" className="garage-door-secondary-action">
                Design a door
              </Link>
            </div>
            <p className="garage-door-hero-meta">REAL DOCUMENTS&nbsp;&nbsp; / &nbsp;&nbsp;TRADE-READY WORKFLOWS</p>
          </div>
        </div>

        <div className="garage-door-sim">
          <GarageDoorScene progress={progress} isDragging={isDragging} dragHandlers={dragHandlers} />
          <p className="garage-door-scene-note">SECTIONAL SYSTEM / 04 PANELS</p>
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
    </section>
  )
}
