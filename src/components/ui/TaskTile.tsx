import { NavigationLink as Link } from './NavigationLink'
import type { ReactNode } from 'react'

/**
 * One task, one tap: an icon, a two- or three-word name, and at most a
 * short hint. The home page and the Tools page are both built from these,
 * so a task looks the same wherever you meet it.
 */
export function TaskTile({
  href,
  icon,
  title,
  hint,
}: {
  href: string
  icon: ReactNode
  title: string
  hint?: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-lg border border-line bg-rail p-4 shadow-panel transition-colors hover:border-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:p-5"
    >
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-signal-tint text-signal">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-graphite">{title}</span>
        {hint && <span className="mt-0.5 block text-sm text-zinc-deep">{hint}</span>}
      </span>
      <span
        className="text-signal transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      >
        →
      </span>
    </Link>
  )
}
