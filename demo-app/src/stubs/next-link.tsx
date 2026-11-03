import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { hrefFor, isExternal, navigate } from '../router'

type Href = string | { pathname?: string; query?: Record<string, string | number | undefined>; hash?: string }

function toPath(href: Href): string {
  if (typeof href === 'string') return href
  const query = href.query
    ? Object.entries(href.query)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : ''
  return `${href.pathname ?? ''}${query ? `?${query}` : ''}${href.hash ? `#${href.hash}` : ''}`
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: Href
  replace?: boolean
  scroll?: boolean
  prefetch?: boolean | null
  children?: ReactNode
}

/** next/link for the demo: an anchor that moves the hash router. */
export default function Link({ href, replace, scroll: _scroll, prefetch: _prefetch, onClick, children, ...rest }: LinkProps) {
  const path = toPath(href)
  const external = isExternal(path)
  return (
    <a
      href={external ? (path.startsWith('/') ? `.${path}` : path) : hrefFor(path)}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (event.defaultPrevented || external) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        if (rest.target === '_blank') return
        event.preventDefault()
        navigate(path, { replace })
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

export function useLinkStatus() {
  return { pending: false }
}
