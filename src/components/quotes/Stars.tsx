/**
 * A star rating drawn from a real average, or an honest "No reviews yet".
 * Never shows stars for a business nobody has reviewed.
 */
export function Stars({ average, count }: { average: number | null; count: number }) {
  if (average === null || count === 0) {
    return <span className="text-sm text-zinc-deep">No reviews yet</span>
  }
  const rounded = Math.round(average * 2) / 2
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm"
      aria-label={`${average.toFixed(1)} out of 5 from ${count} verified review${count === 1 ? '' : 's'}`}
    >
      <span aria-hidden="true" className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            viewBox="0 0 20 20"
            width="16"
            height="16"
            className={
              star <= rounded ? 'text-caution' : star - 0.5 === rounded ? 'text-caution/60' : 'text-line'
            }
          >
            <path
              fill="currentColor"
              d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.8L10 1.5z"
            />
          </svg>
        ))}
      </span>
      <span className="font-medium text-graphite">{average.toFixed(1)}/5</span>
      <span className="text-zinc-deep">
        · {count} verified review{count === 1 ? '' : 's'}
      </span>
    </span>
  )
}
