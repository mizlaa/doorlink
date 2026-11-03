import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

/** What a page shows when it needs a signed-in account. */
export function SignInPrompt({ next, title = 'Sign in to continue' }: { next: string; title?: string }) {
  return (
    <div className="mx-auto max-w-shell px-4 py-16">
      <EmptyState
        title={title}
        description="Use one of the demo accounts on the sign-in page. Every account uses the same demo password."
        action={
          <Link
            href={`/sign-in?next=${encodeURIComponent(next)}`}
            className="inline-flex h-11 items-center justify-center rounded bg-signal px-6 text-sm font-medium text-paper hover:bg-signal-hover"
          >
            Sign in
          </Link>
        }
      />
    </div>
  )
}

/** A small "Demo data" label, used where fictional figures appear. */
export function DemoTag({ children = 'Demo data' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded bg-caution-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-caution">
      {children}
    </span>
  )
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 max-w-prose">
      {eyebrow && <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">{eyebrow}</p>}
      <h1 className="text-2xl font-semibold tracking-tight text-graphite">{title}</h1>
      {children && <div className="mt-1 text-graphite-soft">{children}</div>}
    </header>
  )
}

/**
 * A destructive action that asks on the page before it runs. (Browser
 * confirm() dialogs are blocked in shared preview links.)
 */
export function InlineConfirm({
  label,
  question,
  confirmLabel,
  onConfirm,
  look = 'link',
}: {
  label: string
  question: string
  confirmLabel: string
  onConfirm: () => void
  look?: 'link' | 'button'
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return look === 'button' ? (
      <Button type="button" variant="secondary" size="sm" onClick={() => setAsking(true)}>
        {label}
      </Button>
    ) : (
      <button type="button" className="text-sm font-medium text-bad hover:underline" onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }
  return (
    <span role="group" aria-label={question} className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-graphite">{question}</span>
      <button
        type="button"
        className="font-medium text-bad hover:underline"
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="font-medium text-graphite-soft hover:text-graphite" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  )
}
