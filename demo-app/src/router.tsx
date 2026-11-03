import { useEffect, useSyncExternalStore } from 'react'

/**
 * A small hash router. The demo is a static page (it must open from a
 * plain file server, a phone or a shared link), so every app path lives
 * after the "#": "#/configure?spec=…". Paths and query strings are the
 * same ones the real app uses, so links inside the real components work
 * unchanged.
 *
 * Inside a frame (a shared preview link embeds the page), the host owns
 * the address, so the location is kept in memory instead.
 */
export const isFramed: boolean = (() => {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    return true
  }
})()

let memoryHash = ''
const rawHash = () => (isFramed ? memoryHash : window.location.hash)
export interface DemoLocation {
  pathname: string
  search: string
  fragment: string
}

function read(): DemoLocation {
  const raw = decodeURI(rawHash().replace(/^#/, '')) || '/'
  const path = raw.startsWith('/') ? raw : `/${raw}`
  const fragIndex = path.indexOf('#')
  const beforeFrag = fragIndex === -1 ? path : path.slice(0, fragIndex)
  const fragment = fragIndex === -1 ? '' : path.slice(fragIndex + 1)
  const q = beforeFrag.indexOf('?')
  return {
    pathname: (q === -1 ? beforeFrag : beforeFrag.slice(0, q)).replace(/\/+$/, '') || '/',
    search: q === -1 ? '' : beforeFrag.slice(q),
    fragment,
  }
}

let current = read()
const listeners = new Set<() => void>()

function emit() {
  current = read()
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') window.addEventListener('hashchange', emit)

export function isExternal(href: string): boolean {
  return /^(https?:|mailto:|tel:|sms:|data:|blob:)/i.test(href)
}

/** Resolves a path relative to the current one, the way a browser would. */
export function normalise(href: string): string {
  if (href.startsWith('#')) return `${current.pathname}${current.search}${href}`
  if (href.startsWith('?')) return `${current.pathname}${href}`
  if (href.startsWith('/')) return href
  const base = current.pathname.endsWith('/') ? current.pathname : current.pathname.replace(/[^/]*$/, '')
  return `${base}${href}`
}

export function hrefFor(href: string): string {
  if (isExternal(href)) return href
  return `#${normalise(href)}`
}

export function navigate(href: string, options: { replace?: boolean } = {}) {
  if (isExternal(href)) {
    window.location.href = href
    return
  }
  const target = `#${normalise(href)}`
  if (isFramed) {
    memoryHash = target
    emit()
    return
  }
  if (target === window.location.hash) {
    emit()
    return
  }
  if (options.replace) window.location.replace(target)
  else window.location.hash = target
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLocation(): DemoLocation {
  return useSyncExternalStore(subscribe, () => current)
}

/** Scrolls to the top on a new page, or to the element a "#fragment" names. */
export function useScrollOnNavigate() {
  const location = useLocation()
  useEffect(() => {
    if (location.fragment) {
      const el = document.getElementById(location.fragment)
      if (el) {
        el.scrollIntoView({ block: 'start' })
        return
      }
    }
    window.scrollTo(0, 0)
  }, [location.pathname, location.search, location.fragment])
}

/** Matches "/compare/:reference" style patterns. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean)
  const b = pathname.split('/').filter(Boolean)
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return params
}
