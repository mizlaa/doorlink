'use client'

import { useActionState, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { InvoiceDocument } from '@/components/invoices/InvoiceDocument'
import { initialsFor, LOGO_PALETTES, LOGO_SYMBOLS, LOGO_TEMPLATES, logoOptions, logoSvg, type LogoDesign } from '@/lib/branding/logo'
import { sampleSnapshot, type SampleBrand } from '@/lib/invoices/sample'
import { cn } from '@/lib/utils'
import { saveBuiltLogoAction } from '../actions'

const svgUrl = (design: LogoDesign) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(design))}`
const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * Builds a logo from the business name, initials, colours and a garage-door
 * symbol. Everything is drawn here and on our server from those choices: no
 * paid service, no upload. The chosen design is shown on a sample invoice
 * before it is saved.
 */
export function LogoBuilder({ brand, today, start, next }: { brand: SampleBrand; today: string; start: LogoDesign | null; next: string }) {
  const [name, setName] = useState(start?.name ?? brand.name)
  const [initials, setInitials] = useState(start?.initials ?? initialsFor(brand.name))
  const [palette, setPalette] = useState<{ primary: string; accent: string } | null>(start ? { primary: start.primary, accent: start.accent } : null)
  const [chosen, setChosen] = useState<LogoDesign | null>(start)
  const [state, action, pending] = useActionState(saveBuiltLogoAction, {})

  const options = useMemo(() => logoOptions(name || brand.name, palette ?? undefined).map((o) => ({ ...o, initials: initials || o.initials })), [name, initials, palette, brand.name])
  const design: LogoDesign | null = chosen ? { ...chosen, name: name.trim() || chosen.name, initials: initials || chosen.initials } : null
  const update = (patch: Partial<LogoDesign>) => setChosen((current) => (current ? { ...current, ...patch } : current))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <Field label="Name on the logo" htmlFor="logo-name">
            <Input id="logo-name" value={name} maxLength={48} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Initials" htmlFor="logo-initials">
            <Input id="logo-initials" value={initials} maxLength={3} onChange={(e) => setInitials(e.target.value.replace(/[^A-Za-z0-9&]/g, '').toUpperCase())} />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-graphite">Colours</legend>
          <div className="flex flex-wrap gap-2">
            {LOGO_PALETTES.map((p) => {
              const active = palette?.primary === p.primary && palette?.accent === p.accent
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  title={p.label}
                  onClick={() => {
                    setPalette({ primary: p.primary, accent: p.accent })
                    update({ primary: p.primary, accent: p.accent })
                  }}
                  className={cn('flex h-11 items-center gap-1 rounded-full border px-2', active ? 'border-signal ring-2 ring-signal/30' : 'border-line')}
                >
                  <span className="h-6 w-6 rounded-full" style={{ background: p.primary }} />
                  <span className="h-6 w-6 rounded-full" style={{ background: p.accent }} />
                  <span className="sr-only">{p.label}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div>
          <p className="mb-2 text-sm font-semibold text-graphite">{chosen ? 'Pick a different starting point' : 'Pick a starting point'}</p>
          <ul className="grid grid-cols-2 gap-3">
            {options.map((option) => {
              const active = chosen?.template === option.template
              return (
                <li key={option.template}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setChosen(option)}
                    className={cn('flex h-28 w-full items-center justify-center rounded-lg border bg-white p-3', active ? 'border-signal ring-2 ring-signal/30' : 'border-line hover:border-signal')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- drawn here from the choices above */}
                    <img src={svgUrl(option)} alt={`${LOGO_TEMPLATES.find((t) => t.id === option.template)?.label} layout`} className="max-h-full max-w-full object-contain" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {design && (
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-rail p-4">
            <p className="text-sm font-semibold text-graphite">Fine-tune</p>
            <div>
              <p className="mb-1.5 text-micro text-zinc-deep">Layout</p>
              <div className="flex flex-wrap gap-1.5">
                {LOGO_TEMPLATES.map((t) => (
                  <button key={t.id} type="button" aria-pressed={design.template === t.id} onClick={() => update({ template: t.id })} className={cn('h-9 rounded-full border px-3 text-sm', design.template === t.id ? 'border-graphite bg-graphite text-paper' : 'border-line bg-paper text-graphite')}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-micro text-zinc-deep">Symbol</p>
              <div className="flex flex-wrap gap-1.5">
                {LOGO_SYMBOLS.map((s) => (
                  <button key={s.id} type="button" aria-pressed={design.symbol === s.id} onClick={() => update({ symbol: s.id })} className={cn('h-9 rounded-full border px-3 text-sm', design.symbol === s.id ? 'border-graphite bg-graphite text-paper' : 'border-line bg-paper text-graphite')}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['primary', 'accent'] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-graphite">
                  <input type="color" value={design[key]} onChange={(e) => HEX.test(e.target.value) && update({ [key]: e.target.value.toUpperCase() })} className="h-11 w-14 cursor-pointer rounded border border-line bg-paper" />
                  {key === 'primary' ? 'Main colour' : 'Accent'}
                </label>
              ))}
            </div>
          </div>
        )}

        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="design" value={design ? JSON.stringify(design) : ''} />
          <input type="hidden" name="next" value={next} />
          <Button type="submit" size="lg" className="h-12" disabled={!design || pending}>
            {pending ? 'Saving…' : 'Use this logo'}
          </Button>
          {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
        </form>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-micro font-semibold uppercase tracking-wide text-zinc-deep">{design ? 'How it looks on an invoice' : 'Choose a design to see it on an invoice'}</p>
        <InvoiceDocument snapshot={sampleSnapshot({ ...brand, brandColour: design?.primary ?? brand.brandColour }, today)} logoUrl={design ? svgUrl(design) : null} />
      </div>
    </div>
  )
}
