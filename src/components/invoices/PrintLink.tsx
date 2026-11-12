'use client'

/** The browser's own print, which uses the invoice print layout (A4, invoice only, watermark on every page). */
export function PrintLink({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        compact
          ? 'inline-flex h-11 items-center justify-center rounded border border-line bg-rail px-4 text-sm font-medium text-graphite hover:bg-paper'
          : 'mt-2 flex h-11 w-full items-center justify-center rounded border border-line bg-paper text-sm font-medium text-graphite hover:border-zinc'
      }
    >
      Print
    </button>
  )
}
