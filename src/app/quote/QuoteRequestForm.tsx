'use client'

import { useActionState } from 'react'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import Link from 'next/link'
import { requestQuoteAction, type QuoteRequestState } from './actions'
import type { UnavailableReason } from '@/lib/pricing/engine'
import { Stars } from '@/components/quotes/Stars'
import { Select } from '@/components/ui/Field'
import { cn } from '@/lib/utils'

export interface CompanyCard {
  key: string
  name: string
  profileHref: string | null
  ratingAvg: number | null
  ratingCount: number
  jobsCompleted: number
  baseSuburb: string | null
}

const UNAVAILABLE: Record<UnavailableReason, string> = {
  'not-offered': 'doesn’t have an automated price for this product.',
  size: 'doesn’t have an automated price for this size.',
  configuration: 'has prices for this size, but not with these options (brand, motor or installation).',
}

const initialState: QuoteRequestState = {}

export function QuoteRequestForm({
  spec,
  companies,
  brands,
  mode,
  signInHref,
}: {
  spec: string
  companies: CompanyCard[]
  brands: string[]
  /** 'customer' can request; 'signed-out' is sent to sign in; 'business' is told quotes are for customers. */
  mode: 'customer' | 'signed-out' | 'business'
  signInHref: string
}) {
  const [state, formAction, isPending] = useActionState(requestQuoteAction, initialState)

  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="flex flex-col gap-6">
      <input type="hidden" name="spec" value={spec} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-graphite">Brand</span>
          <Select name="brand" defaultValue="">
            <option value="">No preference</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </Select>
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-graphite">Installation</legend>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'install', label: 'Supply and install' },
              { id: 'supply', label: 'Supply only' },
            ].map((option) => (
              <label
                key={option.id}
                className="cursor-pointer rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm text-graphite has-[:checked]:border-signal has-[:checked]:bg-signal has-[:checked]:text-paper has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal"
              >
                <input
                  type="radio"
                  name="install"
                  value={option.id}
                  defaultChecked={option.id === 'install'}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      {companies.length === 0 ? (
        <p className="rounded-lg border border-line bg-rail p-4 text-sm text-graphite-soft">
          No company has published automated prices for this product yet. You can still{' '}
          <Link href="/request-technician" className="font-medium text-signal hover:text-signal-hover">
            post the job
          </Link>{' '}
          and local technicians will quote.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {companies.map((company) => {
            const unavailable = state.unavailable?.businessKey === company.key ? state.unavailable : null
            return (
              <li
                key={company.key}
                className={cn(
                  'rounded-lg border bg-paper p-4 shadow-panel',
                  unavailable ? 'border-caution/40' : 'border-line'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-graphite">{company.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Stars average={company.ratingAvg} count={company.ratingCount} />
                      {company.jobsCompleted > 0 && (
                        <span className="text-sm text-zinc-deep">
                          {company.jobsCompleted} {company.jobsCompleted === 1 ? 'job' : 'jobs'} done
                        </span>
                      )}
                      {company.baseSuburb && (
                        <span className="text-sm text-zinc-deep">{company.baseSuburb}</span>
                      )}
                    </div>
                    {company.profileHref ? (
                      <Link
                        href={company.profileHref}
                        className="mt-1 inline-block text-sm font-medium text-signal hover:text-signal-hover"
                      >
                        View profile
                      </Link>
                    ) : (
                      <p className="mt-1 text-sm text-zinc-deep">No public profile yet</p>
                    )}
                  </div>
                  {mode === 'customer' ? (
                    <button
                      type="submit"
                      name="business"
                      value={company.key}
                      disabled={isPending}
                      className="inline-flex h-11 items-center rounded-md bg-signal px-5 text-sm font-semibold text-paper transition-colors hover:bg-signal-hover disabled:opacity-60"
                    >
                      {isPending ? 'Working…' : 'Get quote'}
                    </button>
                  ) : mode === 'signed-out' ? (
                    <Link
                      href={signInHref}
                      className="inline-flex h-11 items-center rounded-md border border-line bg-paper px-5 text-sm font-semibold text-graphite hover:bg-rail"
                    >
                      Sign in to get a quote
                    </Link>
                  ) : null}
                </div>
                {unavailable && (
                  <p role="status" className="mt-3 rounded-md bg-caution-tint px-3 py-2 text-sm text-graphite">
                    No automated quote: {unavailable.businessName} {UNAVAILABLE[unavailable.reason]} No price
                    has been estimated. Try another company, change the design, or{' '}
                    <Link
                      href="/request-technician"
                      className="font-medium text-signal hover:text-signal-hover"
                    >
                      post the job
                    </Link>
                    .
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {mode === 'business' && (
        <p className="rounded-lg border border-line bg-rail p-4 text-sm text-graphite-soft">
          Automated quotes are for customer accounts, so businesses can’t see each other’s prices. Your own
          prices are in{' '}
          <Link href="/pricing" className="font-medium text-signal hover:text-signal-hover">
            Automated pricing
          </Link>
          .
        </p>
      )}
    </form>
  )
}
