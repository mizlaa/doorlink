import { useMemo } from 'react'
import { navigate, useLocation, matchPath } from '../router'
import { refreshDemo } from '../demo/store'

export function useRouter() {
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => refreshDemo(),
    prefetch: () => {},
  }
}

export function usePathname(): string {
  return useLocation().pathname
}

export function useSearchParams(): URLSearchParams {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export function useParams(): Record<string, string> {
  const { pathname } = useLocation()
  return matchPath(pathname, pathname) ?? {}
}

/** In the demo a redirect is just a navigation. */
export function redirect(href: string): never {
  navigate(href)
  throw new Error(`Demo redirect to ${href}`)
}

export function notFound(): never {
  navigate('/not-found')
  throw new Error('Demo not found')
}
