'use client'

import { useActionState, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  saveConfigurationAction,
  generateDoorPreviewAction,
  startCreditPackCheckoutAction,
  type ConfigurationActionState,
  type PreviewActionState,
} from './actions'
import { PREVIEW_CREDIT_COST } from '@/lib/credits/constants'
import { PREVIEW_NOTE_MAX_WORDS, previewNoteWordCount } from '@/lib/configurator/preview-prompt'
import { formatMoney } from '@/lib/money'
import {
  DEFAULT_SPEC,
  familyOf,
  groupsFor,
  parseSpec,
  PRODUCT_FAMILIES,
  PRODUCT_TYPES,
  sizeLimitsFor,
  specForType,
  type DoorSpec,
  type ProductFamily,
  type ProductType,
} from '@/lib/configurator/options'
import { previewFromSpec } from '@/lib/configurator/look'
import type { MotorCandidate } from '@/lib/motors/specs'
import { MotorShortlist } from './MotorShortlist'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { NotConnected } from '@/components/ui/NotConnected'
import { cn } from '@/lib/utils'

// The scene is WebGL and several hundred kB; it has no business in the
// bundle of anyone who never opens the configurator, and it cannot be
// server-rendered at all.
const ConfiguratorScene = dynamic(
  () => import('@/components/three/ConfiguratorScene').then((m) => m.ConfiguratorScene),
  {
    ssr: false,
    loading: () => <div className="aspect-[4/3] w-full animate-pulse rounded-2xl bg-rail sm:aspect-[16/10]" />,
  }
)

const initialState: ConfigurationActionState = {}

const initialPreviewState: PreviewActionState = {}

/** What the open/close button and the size fields say, per family. */
const FAMILY_WORDS: Record<
  ProductFamily,
  { open: string; close: string; size: string; width: string; height: string; saveAs: string }
> = {
  garage: {
    open: 'Open the door',
    close: 'Close the door',
    size: 'Opening size',
    width: 'Width (mm)',
    height: 'Height (mm)',
    saveAs: 'My garage door',
  },
  gate: {
    open: 'Open the gate',
    close: 'Close the gate',
    size: 'Opening size',
    width: 'Width (mm)',
    height: 'Height (mm)',
    saveAs: 'My gate',
  },
  fence: {
    open: '',
    close: '',
    size: 'Fence size',
    width: 'Run length (mm)',
    height: 'Height (mm)',
    saveAs: 'My fence',
  },
  shutter: {
    open: 'Raise the shutter',
    close: 'Lower the shutter',
    size: 'Window size',
    width: 'Width (mm)',
    height: 'Height (mm)',
    saveAs: 'My window shutter',
  },
}

export function Configurator({
  signedIn,
  motors = [],
  initialSpec,
  previewAvailable,
  creditBalance,
  creditPacks,
  creditsCheckoutReady,
  creditsCheckoutNotice,
}: {
  signedIn: boolean
  motors?: MotorCandidate[]
  initialSpec?: DoorSpec
  previewAvailable: boolean
  creditBalance: number | null
  creditPacks: Array<{
    code: string
    name: string
    credits: number
    priceCents: number
    currency: string
  }>
  creditsCheckoutReady: boolean
  creditsCheckoutNotice: string | null
}) {
  const [spec, setSpec] = useState<DoorSpec>(initialSpec ?? DEFAULT_SPEC)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [state, formAction, isPending] = useActionState(saveConfigurationAction, initialState)
  const [previewState, previewAction, previewPending] = useActionState(
    generateDoorPreviewAction,
    initialPreviewState
  )

  const groups = useMemo(() => groupsFor(spec.productType), [spec.productType])
  // The form holds whatever is typed; everything drawn or matched uses the
  // same clamped spec the server would store, so a half-typed width can't
  // draw a zero-metre gate.
  const effective = useMemo(() => parseSpec(spec), [spec])
  const preview = useMemo(() => previewFromSpec(effective), [effective])
  const family = familyOf(spec.productType)
  const words = FAMILY_WORDS[family]
  const limits = sizeLimitsFor(spec.productType)
  const familyTypes = PRODUCT_TYPES.filter((type) =>
    PRODUCT_FAMILIES.find((candidate) => candidate.id === family)?.types.includes(type.id as ProductType)
  )

  function set<K extends keyof DoorSpec>(key: K, value: DoorSpec[K]) {
    setSpec((current) => ({ ...current, [key]: value }))
  }

  function setType(productType: ProductType) {
    setSpec((current) => specForType(current, productType))
    setOpen(false)
  }

  const displayBalance = previewState.balance ?? creditBalance
  const noteWords = previewNoteWordCount(note)

  return (
    <div className="flex w-full min-w-0 flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      {/* ------------------------------------------------------------ */}
      <div className="min-w-0 w-full max-w-full lg:sticky lg:top-6 lg:w-[54%] lg:shrink-0">
        <ConfiguratorScene preview={preview} isOpen={open} />

        <div className="mt-3 flex items-center justify-between gap-3">
          {words.open ? (
            <Button type="button" size="sm" onClick={() => setOpen((value) => !value)}>
              {open ? words.close : words.open}
            </Button>
          ) : (
            <span />
          )}
          <p className="text-micro text-zinc-deep">Drag to turn</p>
        </div>
        <p className="mt-2 text-micro text-zinc-deep">
          Generic Doorlink styles, not a specific manufacturer&apos;s product.
        </p>

        {/* Photo preview is prompted for garage doors only, and the action refuses anything else.
            Hidden until an image provider is connected: a "not connected" box is noise to a customer. */}
        {family === 'garage' && previewAvailable && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Photo preview</h2>
            {creditsCheckoutNotice && (
              <p className="mt-3 rounded-md border border-line bg-rail p-3 text-sm text-graphite-soft">
                {creditsCheckoutNotice}
              </p>
            )}
            {previewAvailable ? (
              <>
                {!signedIn ? (
                  <p className="mt-3 text-sm text-graphite-soft">
                    <Link
                      href="/sign-in?next=/configure"
                      className="font-medium text-signal hover:text-signal-hover"
                    >
                      Sign in
                    </Link>{' '}
                    to use photo preview credits.
                  </p>
                ) : (
                  <>
                    <p className="mt-3 text-sm text-graphite-soft">
                      Each successful preview uses {PREVIEW_CREDIT_COST} credit. You have{' '}
                      <span className="font-medium text-graphite">{displayBalance ?? 0}</span> credit
                      {(displayBalance ?? 0) === 1 ? '' : 's'}.
                    </p>

                    {previewState.imageDataUrl && (
                      <figure className="mt-3 max-w-full overflow-hidden rounded-md border border-line">
                        {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral data URL from OpenAI */}
                        <img
                          src={previewState.imageDataUrl}
                          alt="Generated preview of your door choices on your photo"
                          className="block h-auto w-full max-w-full"
                        />
                        <figcaption className="border-t border-line bg-rail px-3 py-2 text-micro text-zinc-deep">
                          AI-generated preview from your photo and choices. Not a product photo from a
                          manufacturer.
                        </figcaption>
                      </figure>
                    )}

                    {(displayBalance ?? 0) >= PREVIEW_CREDIT_COST ? (
                      <form action={previewAction} className="mt-3 flex flex-col gap-3">
                        <input type="hidden" name="spec" value={JSON.stringify(spec)} />
                        <p className="text-sm text-graphite-soft">
                          Upload a photo of your garage opening. We&apos;ll generate one indicative image using
                          your choices above.
                        </p>
                        <Field label="Your photo" htmlFor="preview-photo">
                          <Input
                            id="preview-photo"
                            name="photo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            required
                          />
                        </Field>
                        <Field
                          label="Notes for this preview"
                          htmlFor="preview-note"
                          hint={`${noteWords} / ${PREVIEW_NOTE_MAX_WORDS} words. Optional. Describe the opening, the house, or what to keep.`}
                        >
                          <Textarea
                            id="preview-note"
                            name="note"
                            value={note}
                            maxLength={2000}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="For example: keep the brick piers, and make the door charcoal."
                          />
                        </Field>
                        {noteWords > PREVIEW_NOTE_MAX_WORDS && (
                          <p role="alert" className="text-sm text-bad">
                            Keep the notes to {PREVIEW_NOTE_MAX_WORDS} words.
                          </p>
                        )}
                        {previewState.error && (
                          <p role="alert" className="text-sm text-bad">
                            {previewState.error}
                          </p>
                        )}
                        <Button
                          type="submit"
                          variant="secondary"
                          disabled={previewPending || noteWords > PREVIEW_NOTE_MAX_WORDS}
                        >
                          {previewPending ? 'Generating…' : 'Generate preview'}
                        </Button>
                      </form>
                    ) : (
                      <div className="mt-3 flex flex-col gap-3">
                        {previewState.error && (
                          <p role="alert" className="text-sm text-bad">
                            {previewState.error}
                          </p>
                        )}
                        <p className="text-sm text-graphite-soft">Buy credits to generate a preview.</p>
                        {creditsCheckoutReady && creditPacks.length > 0 ? (
                          <ul className="flex flex-col gap-2">
                            {creditPacks.map((pack) => (
                              <li key={pack.code}>
                                <form action={startCreditPackCheckoutAction}>
                                  <input type="hidden" name="packCode" value={pack.code} />
                                  <Button type="submit" variant="secondary" className="w-full justify-between">
                                    <span>{pack.name}</span>
                                    <span>{formatMoney(pack.priceCents, pack.currency)}</span>
                                  </Button>
                                </form>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <NotConnected
                            feature="Buying credits"
                            reason="Stripe is not connected yet. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to buy preview credits."
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="mt-3">
                <NotConnected
                  feature="Photo preview"
                  reason="No image provider is connected. Set OPENAI_API_KEY to enable photo preview."
                />
              </div>
            )}
          </section>
        )}
      </div>

      {/* ------------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-rail p-1 sm:grid-cols-4">
          {PRODUCT_FAMILIES.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={family === candidate.id}
              onClick={() => family !== candidate.id && setType(candidate.types[0])}
              className={cn(
                'rounded-md px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal',
                family === candidate.id
                  ? 'bg-signal text-paper shadow-panel'
                  : 'text-graphite-soft hover:bg-paper hover:text-graphite'
              )}
            >
              {candidate.label}
            </button>
          ))}
        </div>

        {familyTypes.length > 1 && (
          <ChoiceRow
            label="Type"
            name="productType"
            value={spec.productType}
            options={familyTypes}
            onChange={(id) => setType(id as ProductType)}
          />
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-graphite">{words.size}</legend>
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-micro text-zinc-deep">{words.width}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={limits.widthMm.min}
                max={limits.widthMm.max}
                step={limits.widthMm.step}
                value={spec.widthMm}
                onChange={(event) => set('widthMm', Number(event.target.value))}
              />
            </label>
            <span className="pb-3 text-zinc-deep" aria-hidden="true">
              ×
            </span>
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-micro text-zinc-deep">{words.height}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={limits.heightMm.min}
                max={limits.heightMm.max}
                step={limits.heightMm.step}
                value={spec.heightMm}
                onChange={(event) => set('heightMm', Number(event.target.value))}
              />
            </label>
          </div>
        </fieldset>

        {groups.map((group) =>
          group.id === 'colour' || group.id === 'hardware' ? (
            <SwatchRow
              key={group.id}
              label={group.label}
              name={group.id}
              value={String(spec[group.id as keyof DoorSpec])}
              options={group.values}
              onChange={(id) => set(group.id as keyof DoorSpec, id as never)}
            />
          ) : (
            <ChoiceRow
              key={group.id}
              label={group.label}
              name={group.id}
              value={String(spec[group.id as keyof DoorSpec])}
              options={group.values}
              onChange={(id) => set(group.id as keyof DoorSpec, id as never)}
            />
          )
        )}

        <MotorShortlist spec={effective} motors={motors} />

        {/* ---------------------------------------------------------- */}
        <form action={formAction} className="flex flex-col gap-3 border-t border-line pt-6">
          <input type="hidden" name="spec" value={JSON.stringify(effective)} />
          {signedIn && (
            <div className="flex gap-2">
              <Input
                key={family}
                aria-label="Name this design"
                name="name"
                maxLength={120}
                required
                defaultValue={words.saveAs}
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="secondary" disabled={isPending}>
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
          {state.error && (
            <p role="alert" className="text-sm text-bad">
              {state.error}
            </p>
          )}
          {state.savedId && (
            <p className="text-sm text-good">
              Saved.{' '}
              <Link href="/saved" className="font-medium text-signal hover:text-signal-hover">
                See saved designs
              </Link>
            </p>
          )}
          <Link
            href={`/request-technician?spec=${encodeURIComponent(JSON.stringify(effective))}`}
            className="inline-flex h-12 items-center justify-center rounded-md bg-signal px-5 text-sm font-semibold text-paper transition-colors hover:bg-signal-hover"
          >
            Get quotes on this
          </Link>
          {!signedIn && (
            <p className="text-center text-sm text-zinc-deep">
              <Link href="/sign-in?next=/configure" className="font-medium text-signal hover:text-signal-hover">
                Sign in
              </Link>{' '}
              to save it.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

type Choice = { id: string; label: string; hex?: string; description?: string }

/** One question, its answers as chips. The longer description is a tooltip, not a paragraph. */
function ChoiceRow({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string
  name: string
  value: string
  options: Choice[]
  onChange: (id: string) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-graphite">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.id === value
          return (
            <label
              key={option.id}
              title={option.description}
              className={cn(
                'cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal',
                selected
                  ? 'border-signal bg-signal text-paper'
                  : 'border-line bg-paper text-graphite hover:border-zinc'
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Colours as round swatches; the chosen name sits beside the heading. */
function SwatchRow({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string
  name: string
  value: string
  options: Choice[]
  onChange: (id: string) => void
}) {
  const current = options.find((option) => option.id === value)
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-graphite">
        {label}
        {current && <span className="ml-2 font-normal text-zinc-deep">{current.label}</span>}
      </legend>
      <div className="flex flex-wrap gap-2.5">
        {options.map((option) => {
          const selected = option.id === value
          return (
            <label key={option.id} title={option.label} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
                className="peer sr-only"
              />
              <span className="sr-only">{option.label}</span>
              <span
                aria-hidden="true"
                style={{ backgroundColor: option.hex }}
                className={cn(
                  'block h-9 w-9 rounded-full border border-black/10 shadow-inner transition-shadow',
                  selected
                    ? 'ring-2 ring-signal ring-offset-2'
                    : 'hover:ring-2 hover:ring-line hover:ring-offset-1',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-signal peer-focus-visible:ring-offset-2'
                )}
              />
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
