import { describeSpec, familyOf, specColourHex, type DoorSpec } from '@/lib/configurator/options'
import { DoorGlyph } from './glyphs'

/**
 * A design at a glance: a small drawing, what it is, and its main choices.
 * Used wherever a design travels with a request, a job or an invoice.
 */
export function DesignSummary({ spec, title, compact = false }: { spec: DoorSpec; title?: string; compact?: boolean }) {
  const rows = describeSpec(spec)
  const garage = familyOf(spec.productType) === 'garage'
  const heading = title ?? (garage ? `${rows[0]?.value} garage door` : rows[0]?.value)
  const shown = compact ? rows.slice(1, 4) : rows.slice(1)
  return (
    <div className="flex gap-4 rounded-lg border border-line bg-rail p-4">
      {garage && (
        <div className="w-24 shrink-0 self-start overflow-hidden rounded-md">
          <DoorGlyph profile={spec.productType === 'roller' ? 'ribbed' : spec.panelProfile} windows={spec.productType === 'roller' ? 'none' : spec.windows} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold text-graphite">
          <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: specColourHex(spec) }} />
          <span className="truncate">{heading}</span>
        </p>
        <dl className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
          {shown.map((row) => (
            <div key={row.label} className="flex gap-2">
              <dt className="shrink-0 text-zinc-deep">{row.label}</dt>
              <dd className="min-w-0 truncate text-graphite">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
