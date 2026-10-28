import type { CompanyRating } from '@/lib/quoting/quotes'

/** A rating from stored reviews only. With no reviews it says so rather than showing empty stars. */
export function Stars({ rating, single }: { rating: CompanyRating; single?: boolean }) {
  if (rating.average === null || rating.count === 0) return <span className="text-sm text-zinc-deep">No reviews yet</span>
  const full = Math.round(rating.average)
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-graphite" aria-label={`${rating.average} out of 5 from ${rating.count} review${rating.count === 1 ? '' : 's'}`}>
      <span aria-hidden="true" className="tracking-tight text-caution">{'★'.repeat(full)}<span className="text-line">{'★'.repeat(5 - full)}</span></span>
      <span>{rating.average.toFixed(1)}</span>
      {!single && <span className="text-zinc-deep">({rating.count} review{rating.count === 1 ? '' : 's'})</span>}
    </span>
  )
}
