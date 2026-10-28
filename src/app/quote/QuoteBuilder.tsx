'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import type { MotorChoice, QuoteProductCategory } from '@prisma/client'
import { requestQuotesAction, type QuoteFormState } from './actions'
import { CATEGORIES, categoryInfo } from '@/lib/quoting/catalogue'
import { designGroupsFor, parseDesign, describeDesign, type Design } from '@/lib/quoting/design'
import { DEFAULT_SPEC, type DoorSpec } from '@/lib/configurator/options'
import type { CompanyRating } from '@/lib/quoting/quotes'
import { ProductSketch } from '@/components/quote/ProductSketch'
import { Stars } from '@/components/quote/Stars'
import { Field, Input, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const MAX_COMPANIES = 5

interface CompanyOption {
  id: string
  name: string
  serviceArea: string | null
  categories: QuoteProductCategory[]
  rating: CompanyRating
}

export function QuoteBuilder({
  signedIn,
  initialCategory,
  doorSpec,
  initialWidth,
  initialHeight,
  companies,
  offered,
}: {
  signedIn: boolean
  initialCategory: QuoteProductCategory
  doorSpec: DoorSpec | null
  initialWidth?: string
  initialHeight?: string
  companies: CompanyOption[]
  offered: Partial<Record<QuoteProductCategory, { brands: string[]; motorBrands: string[] }>>
}) {
  const [state, action, pending] = useActionState<QuoteFormState, FormData>(requestQuotesAction, {})
  const [category, setCategory] = useState<QuoteProductCategory>(initialCategory)
  const [width, setWidth] = useState(initialWidth ?? (doorSpec ? String(doorSpec.widthMm) : ''))
  const [height, setHeight] = useState(initialHeight ?? (doorSpec ? String(doorSpec.heightMm) : ''))
  const [simple, setSimple] = useState<Record<string, string>>({})
  const [motorChoice, setMotorChoice] = useState<MotorChoice>(doorSpec ? (doorSpec.opener === 'none' ? 'NONE' : 'ANY') : 'ANY')
  const [motorBrand, setMotorBrand] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const info = categoryInfo(category)
  const groups = designGroupsFor(category)
  const options = offered[category] ?? { brands: [], motorBrands: [] }
  const available = companies.filter((c) => c.categories.includes(category))
  const e = state.errors ?? {}

  const design: Design = useMemo(() => {
    if (category === 'GARAGE_DOOR') return { kind: 'door', spec: { ...(doorSpec ?? DEFAULT_SPEC) } }
    return parseDesign(category, simple)
  }, [category, simple, doorSpec])
  const designRows = describeDesign(category, design)
  const motorBrands = info.motorPolicy === 'list' ? info.motorBrands : options.motorBrands

  function chooseCategory(next: QuoteProductCategory) {
    setCategory(next)
    setSimple({})
    setSelected([])
    setMotorBrand('')
    setMotorChoice(categoryInfo(next).motorPolicy === 'none' ? 'NONE' : 'ANY')
  }
  const toggleCompany = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_COMPANIES ? cur : [...cur, id]))

  const signInHref = `/sign-in?next=${encodeURIComponent(`/quote?category=${info.slug}&width=${width}&height=${height}${doorSpec ? `&spec=${encodeURIComponent(JSON.stringify(doorSpec))}` : ''}`)}`

  return (
    <form action={action} className="flex w-full min-w-0 flex-col gap-10" noValidate>
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="design" value={JSON.stringify(design)} />

      <fieldset>
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">1. Product</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATEGORIES.map((c) => (
            <label key={c.id} className={cn('cursor-pointer rounded-md border p-3 transition-colors', category === c.id ? 'border-signal bg-signal-tint' : 'border-line bg-paper hover:border-zinc')}>
              <input type="radio" name="categoryChoice" value={c.id} checked={category === c.id} onChange={() => chooseCategory(c.id)} className="sr-only" />
              <span className="block text-sm font-medium text-graphite">{c.label}</span>
              <span className="mt-1 block text-micro text-zinc-deep">{c.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">2. Measurements</legend>
            <div className="grid grid-cols-2 gap-4">
              <Field label={`${info.widthLabel} (mm)`} htmlFor="widthMm" error={e.widthMm}>
                <Input id="widthMm" name="widthMm" inputMode="numeric" value={width} onChange={(ev) => setWidth(ev.target.value)} required placeholder="e.g. 2400" />
              </Field>
              <Field label={`${info.heightLabel} (mm)`} htmlFor="heightMm" error={e.heightMm}>
                <Input id="heightMm" name="heightMm" inputMode="numeric" value={height} onChange={(ev) => setHeight(ev.target.value)} required placeholder="e.g. 2100" />
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">3. Design</legend>
            {category === 'GARAGE_DOOR' ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-graphite-soft">
                  {doorSpec ? 'Your door from the 3D designer:' : 'Design your door in the 3D designer, or carry on with the standard design shown.'}
                </p>
                <Link
                  href={`/configure${doorSpec ? `?spec=${encodeURIComponent(JSON.stringify({ ...doorSpec, widthMm: Number(width) || doorSpec.widthMm, heightMm: Number(height) || doorSpec.heightMm }))}` : ''}`}
                  className="inline-flex h-11 w-fit items-center rounded border border-line bg-paper px-4 text-sm font-medium text-graphite hover:bg-rail"
                >
                  {doorSpec ? 'Change the design' : 'Open the 3D door designer'}
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {groups.map((g) => (
                  <div key={g.id}>
                    <p className="mb-2 text-sm font-medium text-graphite">{g.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {g.values.map((v) => {
                        const on = (design as Record<string, unknown>)[g.id] === v.id
                        return (
                          <label key={v.id} className={cn('cursor-pointer rounded border px-3 py-2 text-sm', on ? 'border-signal bg-signal-tint text-graphite' : 'border-line bg-paper text-graphite-soft hover:border-zinc')}>
                            <input type="radio" name={`design-${g.id}`} value={v.id} checked={on} onChange={() => setSimple((cur) => ({ ...cur, [g.id]: v.id }))} className="sr-only" />
                            {v.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-micro text-zinc-deep">Design choices are Doorlink&apos;s generic options. Companies price by product, brand, size, motor and installation, so the design does not change an automated price.</p>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">4. Brand, motor and installation</legend>
            <Field label="Brand" htmlFor="brand" error={e.brand} hint={options.brands.length ? 'Brands participating companies price automatically.' : 'No company has named a brand for this product yet.'}>
              <Select id="brand" name="brand" defaultValue="">
                <option value="">No preference</option>
                {options.brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
            </Field>

            {info.motorPolicy === 'none' ? (
              <input type="hidden" name="motorChoice" value="NONE" />
            ) : (
              <div>
                <p className="mb-2 text-sm font-medium text-graphite">Motor</p>
                <div className="flex flex-wrap gap-2">
                  {(['NONE', 'ANY'] as const).map((m) => (
                    <label key={m} className={cn('cursor-pointer rounded border px-3 py-2 text-sm', motorChoice === m ? 'border-signal bg-signal-tint' : 'border-line bg-paper')}>
                      <input type="radio" name="motorChoice" value={m} checked={motorChoice === m} onChange={() => setMotorChoice(m)} className="sr-only" />
                      {m === 'NONE' ? 'No motor' : 'Motor, any brand'}
                    </label>
                  ))}
                  {motorBrands.map((m) => (
                    <label key={m} className={cn('cursor-pointer rounded border px-3 py-2 text-sm', motorChoice === 'BRAND' && motorBrand === m ? 'border-signal bg-signal-tint' : 'border-line bg-paper')}>
                      <input type="radio" name="motorPick" value={m} checked={motorChoice === 'BRAND' && motorBrand === m} onChange={() => { setMotorChoice('BRAND'); setMotorBrand(m) }} className="sr-only" />
                      {m}
                    </label>
                  ))}
                </div>
                {motorChoice === 'BRAND' && (
                  <>
                    <input type="hidden" name="motorChoice" value="BRAND" />
                    <input type="hidden" name="motorBrand" value={motorBrand} />
                  </>
                )}
                {(e.motorChoice || e.motorBrand) && <p role="alert" className="mt-1 text-micro text-bad">{e.motorChoice ?? e.motorBrand}</p>}
                {info.motorPolicy === 'list' && (
                  <p className="mt-2 text-micro text-zinc-deep">
                    Doorlink does not hold verified data on which of these motors suits which {info.label.toLowerCase()}. A company only quotes a motor it has priced for this product at your size.
                  </p>
                )}
              </div>
            )}

            <label className="flex items-center gap-3 text-sm text-graphite">
              <input type="checkbox" name="installationWanted" value="yes" defaultChecked className="h-4 w-4 accent-signal" />
              Include installation
            </label>
          </fieldset>
        </div>

        <aside className="w-full min-w-0 lg:sticky lg:top-6 lg:w-[38%]">
          <ProductSketch category={category} design={design} widthMm={Number(width)} heightMm={Number(height)} />
          <dl className="mt-4 grid gap-y-1.5">
            {designRows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-line pb-1.5">
                <dt className="text-sm text-zinc-deep">{row.label}</dt>
                <dd className="text-right text-sm text-graphite">{row.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-deep">5. Companies</legend>
        <p className="mb-3 text-sm text-graphite-soft">Choose up to {MAX_COMPANIES}. Ratings come only from reviews customers left on completed Doorlink jobs.</p>
        {available.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-zinc-deep">
            No participating company offers automated quotes for {info.plural.toLowerCase()} yet.{' '}
            <Link href="/request-technician" className="font-medium text-signal hover:text-signal-hover">Post a job instead</Link> and technicians can quote by hand.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {available.map((c) => {
              const on = selected.includes(c.id)
              return (
                <li key={c.id}>
                  <label className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-4', on ? 'border-signal bg-signal-tint' : 'border-line bg-paper hover:border-zinc')}>
                    <input type="checkbox" name="company" value={c.id} checked={on} onChange={() => toggleCompany(c.id)} className="mt-1 h-4 w-4 accent-signal" disabled={!on && selected.length >= MAX_COMPANIES} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-graphite">{c.name}</span>
                      <span className="mt-1 block"><Stars rating={c.rating} /></span>
                      <span className="mt-1 block text-micro text-zinc-deep">{c.serviceArea ?? 'Service area not stated'}</span>
                    </span>
                    <Link href={`/companies/${c.id}`} target="_blank" className="shrink-0 text-sm font-medium text-signal hover:text-signal-hover">Profile</Link>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {e.companies && <p role="alert" className="mt-2 text-sm text-bad">{e.companies}</p>}
      </fieldset>

      <div className="flex flex-col gap-4 border-t border-line pt-6">
        {signedIn ? (
          <>
            <label className="flex items-start gap-3 text-sm text-graphite">
              <input type="checkbox" name="shareContact" className="mt-0.5 h-4 w-4 accent-signal" />
              <span>Share my name and email with the companies I choose, so they can contact me about this quote.</span>
            </label>
            {e.form && <p role="alert" className="text-sm text-bad">{e.form}</p>}
            {e.category && <p role="alert" className="text-sm text-bad">{e.category}</p>}
            <Button type="submit" disabled={pending || available.length === 0} className="w-full sm:w-fit">
              {pending ? 'Working out quotes…' : 'Get my quotes'}
            </Button>
          </>
        ) : (
          <p className="text-sm text-graphite-soft">
            <Link href={signInHref} className="font-medium text-signal hover:text-signal-hover">Sign in</Link> to get quotes. Your quotes are kept in your account, visible only to you and the companies you choose.
          </p>
        )}
      </div>
    </form>
  )
}
