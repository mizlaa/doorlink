import Link from 'next/link'

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-shell flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="text-micro font-medium uppercase tracking-wide text-zinc-deep">404</p>
      <h1 className="text-2xl font-semibold text-graphite">We couldn't find that page.</h1>
      <p className="max-w-prose text-sm text-zinc-deep">The page may have moved, or the link might be out of date.</p>
      <Link
        href="/"
        className="inline-flex h-11 items-center justify-center rounded bg-signal px-6 text-sm font-medium text-paper hover:bg-signal-hover"
      >
        Go home
      </Link>
    </div>
  )
}
