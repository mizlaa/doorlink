import { useEffect, useMemo, useState } from 'react'
import { COMPANIES } from '../demo/data'
import { prefersReducedMotion } from '../three/quality'

/**
 * The guided introduction: the story, the caption bubble and the two
 * overlays it uses. The world drives the timeline (see DoorlinkWorld); this
 * file only holds what is said and how it is shown.
 */

const SEEN_KEY = 'doorlink:intro-seen-v1'
export const introSeen = () => {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}
export const markIntroSeen = () => {
  try {
    window.localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* private mode: the intro simply plays again next time */
  }
}

/** Scene 1, on the homepage while the door rises and the portal forms. */
export const HOME_LINES = [
  'Welcome to Doorlink.',
  'One platform. Endless possibilities.',
  'Established in 2026, Doorlink is transforming how customers and professionals connect.',
]

export const SCENE_TITLES = ['Welcome', 'Garage doors', 'Gates & access', 'Shutters & fencing', 'Professionals', 'The Doorlink experience', 'Doorlink']

/** One caption bubble: fades in and types itself out quickly, never holding the scene up. */
export function IntroCaption({ text, scene, placement }: { text: string | null; scene: number; placement: 'hero' | 'fixed' | 'world' }) {
  const reduced = useMemo(prefersReducedMotion, [])
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!text) return
    if (reduced) {
      setShown(text.length)
      return
    }
    setShown(0)
    const start = performance.now()
    // A timer, not animation frames: typing keeps pace even when rendering is slow.
    const timer = window.setInterval(() => {
      // ~55 characters a second: a long line is fully written in under 1.6 s.
      const n = Math.min(text.length, Math.floor(((performance.now() - start) / 1000) * 55))
      setShown(n)
      if (n >= text.length) window.clearInterval(timer)
    }, 30)
    return () => window.clearInterval(timer)
  }, [text, reduced])
  if (!text) return null
  return (
    <div className={`intro-caption is-${placement}`} role="status" aria-live="polite">
      <p className="intro-kicker">
        <span className="intro-dot" aria-hidden="true" />
        {SCENE_TITLES[scene] ?? 'Doorlink'}
        <span className="intro-count">
          {scene + 1} / {SCENE_TITLES.length}
        </span>
      </p>
      <p key={text} className="intro-line">
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">
          {text.slice(0, shown)}
          <span className="intro-ghost">{text.slice(shown)}</span>
        </span>
      </p>
    </div>
  )
}

/** Scene 5: a glimpse of the quote comparison, using the demo's own (fictional) businesses. */
function MarketOverlay() {
  const picks = useMemo(() => [...COMPANIES].sort((a, b) => b.rating - a.rating).slice(0, 3), [])
  return (
    <div className="intro-panel">
      <p className="intro-panel-title">Quotes for your project</p>
      <p className="intro-panel-sub">Compare local businesses side by side</p>
      <ul className="intro-quotes">
        {picks.map((c, i) => (
          <li key={c.id} style={{ animationDelay: `${0.25 + i * 0.18}s` }}>
            <span className="intro-avatar" aria-hidden="true">
              {c.name
                .split(' ')
                .slice(0, 2)
                .map((w) => w[0])
                .join('')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="intro-q-name">{c.name}</span>
              <span className="intro-q-meta">
                ★ {c.rating.toFixed(1)} · {c.reviewCount} reviews · {c.suburb}
              </span>
            </span>
            <span className="intro-q-tag">{c.responseTime}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Scene 6: what Doorlink actually does, each mapped to a real part of the app. */
const FEATURES = [
  { title: 'Design it', body: '3D designer for doors, gates, fences and shutters', icon: 'M4 20h16M6 16l8-8 4 4-8 8H6z' },
  { title: 'Visualise it', body: 'Doorlink World, X-ray views and your own property', icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { title: 'Compare it', body: 'Free quotes from local businesses, side by side', icon: 'M4 6h16M4 12h10M4 18h7' },
  { title: 'Connect', body: 'Hire a pro, the marketplace and manuals', icon: 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a6 6 0 0 1 12 0M17 11l2 2 4-4' },
]
function FeaturesOverlay() {
  return (
    <div className="intro-panel">
      <p className="intro-panel-title">One place for the whole project</p>
      <ul className="intro-features">
        {FEATURES.map((f, i) => (
          <li key={f.title} style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={f.icon} />
            </svg>
            <span>
              <span className="intro-f-title">{f.title}</span>
              <span className="intro-f-body">{f.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Scene 7: the logo reveal. */
function LogoReveal({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="intro-logo">
      <span className="intro-logo-mark" aria-hidden="true">
        DL
      </span>
      <p className="intro-logo-word">DOORLINK</p>
      <p className="intro-logo-tag">Your Vision. Our Connection.</p>
      <button type="button" className="world-btn is-primary" onClick={onContinue}>
        Explore the property
      </button>
    </div>
  )
}

export type IntroOverlay = 'market' | 'features' | 'logo' | null
export function IntroOverlays({ overlay, onContinue }: { overlay: IntroOverlay; onContinue: () => void }) {
  if (overlay === 'market') return <MarketOverlay />
  if (overlay === 'features') return <FeaturesOverlay />
  if (overlay === 'logo') return <LogoReveal onContinue={onContinue} />
  return null
}
