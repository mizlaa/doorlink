import { cn } from '@/lib/utils'

const STEPS = ['Customer or job', 'Items and price', 'Preview and issue']

/** Where someone is in the three steps of raising an invoice. */
export function Steps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-sm" aria-label="Invoice steps">
      {STEPS.map((label, i) => {
        const n = i + 1
        const state = n < current ? 'done' : n === current ? 'current' : 'todo'
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-micro font-bold',
                state === 'current' ? 'bg-signal text-paper' : state === 'done' ? 'bg-good text-paper' : 'border border-line bg-rail text-zinc-deep'
              )}
            >
              {state === 'done' ? '✓' : n}
            </span>
            <span className={cn('truncate', state === 'current' ? 'font-semibold text-graphite' : 'text-zinc-deep', state !== 'current' && 'hidden sm:inline')}>{label}</span>
            {n < STEPS.length && <span aria-hidden="true" className="h-px flex-1 bg-line" />}
          </li>
        )
      })}
    </ol>
  )
}
