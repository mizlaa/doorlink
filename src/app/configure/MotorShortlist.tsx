import Link from 'next/link'
import type { MotorCandidate } from '@/lib/motors/specs'
import { recommendMotors } from '@/lib/motors/specs'
import { estimateFor, requirementFor, roughKg } from '@/lib/configurator/estimate'
import { familyOf, isMotorised, type DoorSpec } from '@/lib/configurator/options'

/**
 * The motors whose published ratings cover the design, best fit first.
 *
 * It states the estimate it matched against, so the customer and the
 * installer can see *why* a motor is on the list — and why a heavier
 * material or a longer leaf takes one off it.
 */
export function MotorShortlist({ spec, motors }: { spec: DoorSpec; motors: MotorCandidate[] }) {
  const family = familyOf(spec.productType)
  if (family === 'garage' || family === 'fence') return null

  const estimate = estimateFor(spec)
  const requirement = requirementFor(spec)
  const brand = spec.motorBrand === 'any' ? undefined : spec.motorBrand
  const matches = requirement ? recommendMotors(requirement, motors, { brand, limit: 5 }) : []

  const facts: string[] = []
  if (estimate) {
    if (family === 'shutter') {
      facts.push(`Curtain ${roughKg(estimate.totalKg)}`)
      facts.push(`needs ${Math.ceil(estimate.torqueNm ?? 0)} Nm or more`)
    } else if (spec.productType === 'swing-gate' && spec.leaves === '2') {
      facts.push(`Gate ${roughKg(estimate.totalKg)}`)
      facts.push(`each leaf ${estimate.leafLengthM.toFixed(1)} m, ${roughKg(estimate.leafKg)}`)
    } else {
      facts.push(`Gate ${roughKg(estimate.totalKg)}`)
    }
  }

  return (
    <section aria-labelledby="motor-heading" className="rounded-lg border border-line bg-rail p-4">
      <h2 id="motor-heading" className="text-sm font-medium text-graphite">
        Matching motors
      </h2>
      {facts.length > 0 && <p className="mt-1 text-sm text-zinc-deep">{facts.join(' · ')}</p>}

      {!isMotorised(spec) ? (
        <p className="mt-2 text-sm text-zinc-deep">No motor — choose motorised to see matching motors.</p>
      ) : matches.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-deep">
          {motors.length === 0
            ? 'The motor catalogue isn’t available right now.'
            : brand
              ? 'No motor from this brand is rated for it. Try Best match, or a lighter material.'
              : 'No catalogued motor is rated for this. An installer can advise on a commercial operator.'}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.motor.id}>
              <Link
                href={`/model/${match.motor.id}`}
                className="flex items-baseline justify-between gap-3 rounded-md border border-line bg-paper px-3 py-2 transition-colors hover:border-signal"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-graphite">
                    {match.motor.manufacturer} {match.motor.modelCode}
                  </span>
                  <span className="block text-micro text-zinc-deep">
                    Rated {match.rating}
                    {match.motor.supply ? ` · ${match.motor.supply}` : ''}
                  </span>
                  {match.caveat && <span className="block text-micro text-caution">{match.caveat}</span>}
                </span>
                <span className="text-signal" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-micro text-zinc-deep">
        Estimated weight, matched to published ratings. Your installer confirms on site.
      </p>
    </section>
  )
}
