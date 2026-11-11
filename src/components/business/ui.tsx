import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared pieces for the business area, so every screen has the same
 * shape: a title, one obvious primary action, then the work.
 */

export function PageHeader({ title, subtitle, action, back }: { title: string; subtitle?: ReactNode; action?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm font-medium text-signal hover:text-signal-hover">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-graphite-soft">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  )
}

/** A link that looks like the primary button. */
export function PrimaryLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded bg-signal px-5 text-sm font-semibold text-paper transition-colors hover:bg-signal-hover',
        className
      )}
    >
      {children}
    </Link>
  )
}

export function SecondaryLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded border border-line bg-rail px-4 text-sm font-medium text-graphite transition-colors hover:border-zinc',
        className
      )}
    >
      {children}
    </Link>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-line bg-rail p-4 sm:p-5', className)}>{children}</div>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">{children}</h2>
      {action}
    </div>
  )
}

/** A number that needs attention, linking to where it is dealt with. */
export function StatTile({ href, value, label, tone = 'neutral', hint }: { href: string; value: ReactNode; label: string; tone?: 'neutral' | 'attention' | 'good'; hint?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col rounded-lg border bg-rail p-4 transition-colors hover:border-signal',
        tone === 'attention' ? 'border-caution/40' : 'border-line'
      )}
    >
      <span className={cn('text-3xl font-semibold tabular-nums', tone === 'attention' ? 'text-caution' : tone === 'good' ? 'text-good' : 'text-graphite')}>{value}</span>
      <span className="mt-1 text-sm font-medium text-graphite">{label}</span>
      {hint && <span className="mt-0.5 text-micro text-zinc-deep">{hint}</span>}
    </Link>
  )
}

const PILL_TONES = {
  neutral: 'bg-paper text-graphite-soft border-line',
  blue: 'bg-signal-tint text-signal border-signal/20',
  amber: 'bg-caution-tint text-caution border-caution/20',
  green: 'bg-good/10 text-good border-good/20',
  red: 'bg-bad/10 text-bad border-bad/20',
} as const

export type PillTone = keyof typeof PILL_TONES

export function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-micro font-semibold', PILL_TONES[tone])}>{children}</span>
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const classes = {
    info: 'border-line bg-rail text-graphite',
    warn: 'border-caution/30 bg-caution-tint text-graphite',
    error: 'border-bad/30 bg-bad/10 text-bad',
    ok: 'border-good/30 bg-good/10 text-graphite',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', classes)}>
      {children}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium text-graphite">{title}</p>
      {children && <p className="max-w-prose text-sm text-zinc-deep">{children}</p>}
      {action}
    </div>
  )
}
