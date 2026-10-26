export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-shell px-4 py-10 sm:py-14" role="status" aria-live="polite">
      <p className="mb-6 text-sm font-medium text-graphite-soft">Loading page…</p>
      <div className="space-y-5 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-8 w-56 rounded bg-rail" />
        <div className="h-4 w-3/4 max-w-lg rounded bg-rail" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-64 rounded-xl border border-line bg-rail" />
          <div className="space-y-4">
            <div className="h-16 rounded-lg bg-rail" />
            <div className="h-16 rounded-lg bg-rail" />
            <div className="h-16 rounded-lg bg-rail" />
          </div>
        </div>
      </div>
    </div>
  )
}
