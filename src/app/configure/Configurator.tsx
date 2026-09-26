'use client'

import { useActionState, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { saveConfigurationAction, generateDoorPreviewAction, type ConfigurationActionState, type PreviewActionState } from './actions'
import {
  DEFAULT_SPEC,
  describeSpec,
  groupsFor,
  PRODUCT_TYPES,
  SIZE_LIMITS,
  type DoorSpec,
  type ProductType,
} from '@/lib/configurator/options'
import { lookFromSpec } from '@/lib/configurator/look'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
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

export function Configurator({
  signedIn,
  initialSpec,
  previewAvailable,
}: {
  signedIn: boolean
  initialSpec?: DoorSpec
  previewAvailable: boolean
}) {
  const [spec, setSpec] = useState<DoorSpec>(initialSpec ?? DEFAULT_SPEC)
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState(saveConfigurationAction, initialState)
  const [previewState, previewAction, previewPending] = useActionState(
    generateDoorPreviewAction,
    initialPreviewState
  )

  const groups = useMemo(() => groupsFor(spec.productType), [spec.productType])
  const look = useMemo(() => lookFromSpec(spec), [spec])
  const summary = useMemo(() => describeSpec(spec), [spec])

  function set<K extends keyof DoorSpec>(key: K, value: DoorSpec[K]) {
    setSpec((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      {/* ------------------------------------------------------------ */}
      <div className="lg:sticky lg:top-6 lg:w-[54%] lg:shrink-0">
        <ConfiguratorScene look={look} isOpen={open} />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? 'Close the door' : 'Open the door'}
          </Button>
          <p className="text-micro text-zinc-deep">Drag to look around.</p>
        </div>

        {/* The single most important sentence on this page. */}
        <p className="mt-4 rounded-md border border-caution/30 bg-caution-tint p-3 text-sm text-graphite">
          These are Doorlink&apos;s own generic options, not any manufacturer&apos;s range. The preview shows
          the shape and colour you have chosen. It is not a picture of a specific product, and no manufacturer
          has quoted on it.
        </p>

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Photo preview</h2>
          {previewAvailable ? (
            <form action={previewAction} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="spec" value={JSON.stringify(spec)} />
              <p className="text-sm text-graphite-soft">
                Upload a photo of your garage opening or the front of the house. We&apos;ll generate one
                indicative image using your choices above. It is a demo, not a manufacturer quote photo.
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
              {previewState.error && (
                <p role="alert" className="text-sm text-bad">
                  {previewState.error}
                </p>
              )}
              <Button type="submit" variant="secondary" disabled={previewPending}>
                {previewPending ? 'Generating…' : 'Generate preview'}
              </Button>
              {previewState.imageDataUrl && (
                <figure className="overflow-hidden rounded-md border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral data URL from OpenAI */}
                  <img
                    src={previewState.imageDataUrl}
                    alt="Generated preview of your door choices on your photo"
                    className="w-full"
                  />
                  <figcaption className="border-t border-line bg-rail px-3 py-2 text-micro text-zinc-deep">
                    AI-generated preview from your photo and choices. Not a product photo from a manufacturer.
                  </figcaption>
                </figure>
              )}
            </form>
          ) : (
            <div className="mt-3">
              <NotConnected
                feature="Photo preview"
                reason="No image provider is connected. Set OPENAI_API_KEY to try a test preview on your own photo."
              />
            </div>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------------ */}
      <div className="min-w-0 flex-1">
        <fieldset className="mb-8">
          <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">
            Door type
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRODUCT_TYPES.map((type) => (
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
                  onChange={() => set('productType', type.id as ProductType)}
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
            Opening size
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Width (mm)" htmlFor="widthMm">
              <Input
                id="widthMm"
                type="number"
                inputMode="numeric"
                min={SIZE_LIMITS.widthMm.min}
                max={SIZE_LIMITS.widthMm.max}
                step={SIZE_LIMITS.widthMm.step}
                value={spec.widthMm}
                onChange={(event) => set('widthMm', Number(event.target.value))}
              />
            </Field>
            <Field label="Height (mm)" htmlFor="heightMm">
              <Input
                id="heightMm"
                type="number"
                inputMode="numeric"
                min={SIZE_LIMITS.heightMm.min}
                max={SIZE_LIMITS.heightMm.max}
                step={SIZE_LIMITS.heightMm.step}
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
            <input type="hidden" name="spec" value={JSON.stringify(spec)} />

            {signedIn ? (
              <>
                <Field label="Name this configuration" htmlFor="name" hint="So you can find it again.">
                  <Input id="name" name="name" maxLength={120} required defaultValue="My garage door" />
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
                    href={`/request-technician?spec=${encodeURIComponent(JSON.stringify(spec))}`}
                    className="inline-flex h-11 items-center rounded border border-line bg-paper px-4 text-sm font-medium text-graphite transition-colors hover:bg-rail"
                  >
                    Get quotes on this
                  </Link>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/request-technician?spec=${encodeURIComponent(JSON.stringify(spec))}`}
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
