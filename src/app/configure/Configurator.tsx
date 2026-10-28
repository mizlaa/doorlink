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
  describeSpec,
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
  const summary = useMemo(() => describeSpec(effective), [effective])
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

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {words.open ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
              {open ? words.close : words.open}
            </Button>
          ) : (
            <span />
          )}
          <p className="text-micro text-zinc-deep">Drag to look around.</p>
        </div>

        {/* The single most important sentence on this page. */}
        <p className="mt-4 rounded-md border border-caution/30 bg-caution-tint p-3 text-sm text-graphite">
          Generic Doorlink options, not a specific manufacturer&apos;s product.
        </p>

        {/* Photo preview is prompted for garage doors only, and the action refuses anything else. */}
        {family === 'garage' && (
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
      <div className="min-w-0 flex-1">
        <fieldset className="mb-6">
          <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
            What are you designing?
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRODUCT_FAMILIES.map((candidate) => (
              <label
                key={candidate.id}
                className={cn(
                  'cursor-pointer rounded-md border p-3 text-center transition-colors',
                  family === candidate.id
                    ? 'border-signal bg-signal-tint'
                    : 'border-line bg-paper hover:border-zinc'
                )}
              >
                <input
                  type="radio"
                  name="family"
                  value={candidate.id}
                  checked={family === candidate.id}
                  onChange={() => setType(candidate.types[0])}
                  className="sr-only"
                />
                <span className="block text-sm font-medium text-graphite">{candidate.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-8">
          <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
            {family === 'garage' ? 'Door type' : family === 'gate' ? 'Gate type' : 'Type'}
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {familyTypes.map((type) => (
              <label
                key={type.id}
                className={cn(
                  'cursor-pointer rounded-md border p-3 transition-colors',
                  spec.productType === type.id
                    ? 'border-signal bg-signal-tint'
                    : 'border-line bg-paper hover:border-zinc'
                )}
              >
                <input
                  type="radio"
                  name="productType"
                  value={type.id}
                  checked={spec.productType === type.id}
                  onChange={() => setType(type.id as ProductType)}
                  className="sr-only"
                />
                <span className="block text-sm font-medium text-graphite">{type.label}</span>
                {type.description && (
                  <span className="mt-1 block text-micro text-zinc-deep">{type.description}</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-8">
          <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
            {words.size}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={words.width} htmlFor="widthMm" hint={`${limits.widthMm.min}–${limits.widthMm.max}`}>
              <Input
                id="widthMm"
                type="number"
                inputMode="numeric"
                min={limits.widthMm.min}
                max={limits.widthMm.max}
                step={limits.widthMm.step}
                value={spec.widthMm}
                onChange={(event) => set('widthMm', Number(event.target.value))}
              />
            </Field>
            <Field
              label={words.height}
              htmlFor="heightMm"
              hint={`${limits.heightMm.min}–${limits.heightMm.max}`}
            >
              <Input
                id="heightMm"
                type="number"
                inputMode="numeric"
                min={limits.heightMm.min}
                max={limits.heightMm.max}
                step={limits.heightMm.step}
                value={spec.heightMm}
                onChange={(event) => set('heightMm', Number(event.target.value))}
              />
            </Field>
          </div>
        </fieldset>

        {groups.map((group) => (
          <fieldset key={group.id} className="mb-8">
            <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
              {group.label}
            </legend>
            {group.help && <p className="mb-3 text-micro text-zinc-deep">{group.help}</p>}

            <div
              className={cn(
                'grid gap-2',
                group.id === 'colour' ? 'grid-cols-4 sm:grid-cols-8' : 'sm:grid-cols-2'
              )}
            >
              {group.values.map((value) => {
                const selected = spec[group.id as keyof DoorSpec] === value.id
                if (group.id === 'colour' || group.id === 'hardware') {
                  return (
                    <label key={value.id} className="flex cursor-pointer flex-col items-center gap-1">
                      <input
                        type="radio"
                        name={group.id}
                        value={value.id}
                        checked={selected}
                        onChange={() => set(group.id as keyof DoorSpec, value.id as never)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: value.hex }}
                        className={cn(
                          'h-10 w-full rounded border transition-[box-shadow,border-color]',
                          selected ? 'border-graphite ring-2 ring-signal ring-offset-1' : 'border-line',
                          'peer-focus-visible:ring-2 peer-focus-visible:ring-signal peer-focus-visible:ring-offset-1'
                        )}
                      />
                      <span className="text-center text-micro text-zinc-deep">{value.label}</span>
                    </label>
                  )
                }

                return (
                  <label
                    key={value.id}
                    className={cn(
                      'cursor-pointer rounded-md border p-3 transition-colors',
                      selected ? 'border-signal bg-signal-tint' : 'border-line bg-paper hover:border-zinc'
                    )}
                  >
                    <input
                      type="radio"
                      name={group.id}
                      value={value.id}
                      checked={selected}
                      onChange={() => set(group.id as keyof DoorSpec, value.id as never)}
                      className="sr-only"
                    />
                    <span className="block text-sm font-medium text-graphite">{value.label}</span>
                    {value.description && (
                      <span className="mt-1 block text-micro text-zinc-deep">{value.description}</span>
                    )}
                  </label>
                )
              })}
            </div>
          </fieldset>
        ))}

        <MotorShortlist spec={effective} motors={motors} />

        {/* ---------------------------------------------------------- */}
        <section className="border-t border-line pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Your specification</h2>
          <dl className="mt-3 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {summary.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-line pb-1.5"
              >
                <dt className="text-sm text-zinc-deep">{row.label}</dt>
                <dd className="text-right text-sm text-graphite">{row.value}</dd>
              </div>
            ))}
          </dl>

          <form action={formAction} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="spec" value={JSON.stringify(effective)} />

            {signedIn ? (
              <>
                <Field label="Name this configuration" htmlFor="name" hint="So you can find it again.">
                  <Input
                    key={family}
                    id="name"
                    name="name"
                    maxLength={120}
                    required
                    defaultValue={words.saveAs}
                  />
                </Field>

                {state.error && (
                  <p role="alert" className="text-sm text-bad">
                    {state.error}
                  </p>
                )}
                {state.savedId && (
                  <p className="text-sm text-good">
                    Saved.{' '}
                    <Link href="/saved" className="font-medium text-signal hover:text-signal-hover">
                      See your saved configurations
                    </Link>
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={isPending}>
                    {isPending ? 'Saving…' : 'Save this configuration'}
                  </Button>
                  <Link
                    href={`/request-technician?spec=${encodeURIComponent(JSON.stringify(effective))}`}
                    className="inline-flex h-11 items-center rounded border border-line bg-paper px-4 text-sm font-medium text-graphite transition-colors hover:bg-rail"
                  >
                    Get quotes on this
                  </Link>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/request-technician?spec=${encodeURIComponent(JSON.stringify(effective))}`}
                  className="inline-flex h-11 items-center rounded bg-signal px-5 text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
                >
                  Get quotes on this
                </Link>
                <p className="text-sm text-zinc-deep">
                  <Link href="/sign-in" className="font-medium text-signal hover:text-signal-hover">
                    Sign in
                  </Link>{' '}
                  to save it.
                </p>
              </div>
            )}
          </form>
        </section>
      </div>
    </div>
  )
}
