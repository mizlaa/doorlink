'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * A small rotating ring in the bottom-left corner while the next page
 * loads, so a tap always gets an answer.
 *
 * It starts on a click of an internal link (or a form that navigates)
 * and stops when the URL changes. A short delay keeps it from flashing
 * on pages that are already cached, and a timeout stops it spinning
 * forever if a navigation is cancelled.
 */
export function NavigationSpinner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const showTimer = useRef<number | undefined>(undefined)
  const giveUpTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(showTimer.current)
    window.clearTimeout(giveUpTimer.current)
    setVisible(false)
  }, [pathname, searchParams])

  useEffect(() => {
    function start() {
      window.clearTimeout(showTimer.current)
      window.clearTimeout(giveUpTimer.current)
      showTimer.current = window.setTimeout(() => setVisible(true), 120)
      giveUpTimer.current = window.setTimeout(() => setVisible(false), 15000)
    }

    function onClick(event: MouseEvent) {
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Same page, or only a #fragment: nothing will load.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      start()
    }

    // Capture phase: next/link cancels the click's default action to route
    // client-side, so a bubbling listener would see every link as cancelled.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-24 left-4 z-50 transition-opacity duration-200 sm:bottom-5 sm:left-5 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper/95 shadow-panel backdrop-blur">
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-signal/25 border-t-signal"
          aria-hidden="true"
        />
      </span>
      <span className="sr-only">{visible ? 'Loading' : ''}</span>
    </div>
  )
}
