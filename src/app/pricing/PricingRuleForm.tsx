'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { saveRuleAction, type RuleFormState } from './actions'
import {
  gstBreakdown,
  type GstTreatmentId,
  type InstallationTermsId,
  type PricedProductId,
} from '@/lib/pricing/engine'
import {
  GARAGE_STYLES,
  motorBrandIsListed,
  motorBrandsFor,
  PRICED_PRODUCTS,
  productHasMotor,
} from '@/lib/pricing/products'
import { parseMoney } from '@/lib/pricing/validation'
import { formatMoney } from '@/lib/money'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { cn } from '@/lib/utils'

export interface RuleFormValues {
  id?: string
  product: PricedProductId
  productStyle: string
  productBrand: string
  motorIncluded: boolean
  motorBrand: string
  installation: InstallationTermsId
  installPrice: string
  minWidthMm: string
  maxWidthMm: string
  minHeightMm: string
  maxHeightMm: string
  price: string
  gst: GstTreatmentId
  note: string
  active: boolean
}

export const EMPTY_RULE: RuleFormValues = {
  product: 'GARAGE_DOOR',
  productStyle: '',
  productBrand: '',
  motorIncluded: true,
  motorBrand: '',
  installation: 'INCLUDED',
  installPrice: '',
  minWidthMm: '',
  maxWidthMm: '',
  minHeightMm: '',
  maxHeightMm: '',
  price: '',
  gst: 'EXCLUSIVE',
  note: '',
  active: true,
}

const initialState: RuleFormState = {}

function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string
  value: T
  options: Array<{ id: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option.id}
          className={cn(
            'cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal',
            value === option.id
              ? 'border-signal bg-signal text-paper'
              : 'border-line bg-paper text-graphite hover:border-zinc'
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}

/** What the customer will be shown for this price, worked out as the business types. */
function PricePreview({ values }: { values: RuleFormValues }) {
  const price = parseMoney(values.price)
  const install = values.installation === 'SEPARATE' ? parseMoney(values.installPrice) : 0
  if (price === null || install === null) return null
  const breakdown = gstBreakdown(price + install, values.gst)
  return (
    <p className="rounded-md border border-line bg-rail px-3 py-2 text-sm text-graphite">
      Customer sees {formatMoney(breakdown.subtotalExGstCents)} + GST {formatMoney(breakdown.gstCents)} ={' '}
      <span className="font-semibold">{formatMoney(breakdown.totalIncGstCents)} inc GST</span>
      {values.installation === 'SEPARATE' && ' (with installation)'}
    </p>
  )
}

export function PricingRuleForm({ initial = EMPTY_RULE }: { initial?: RuleFormValues }) {
  const [state, formAction, isPending] = useActionState(saveRuleAction, initialState)
  const [values, setValues] = useState<RuleFormValues>(initial)
  const set = <K extends keyof RuleFormValues>(key: K, value: RuleFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const listedMotors = motorBrandsFor(values.product)
  const hasMotor = productHasMotor(values.product)

  function changeProduct(product: PricedProductId) {
    setValues((current) => ({
      ...current,
      product,
      productStyle: product === 'GARAGE_DOOR' ? current.productStyle : '',
      motorIncluded: productHasMotor(product) ? current.motorIncluded : false,
      // A listed brand from another product would not be valid here.
      motorBrand:
        motorBrandIsListed(product) && !motorBrandsFor(product).some((b) => b.id === current.motorBrand)
          ? ''
          : current.motorBrand,
    }))
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product" htmlFor="product">
          <Select
            id="product"
            name="product"
            value={values.product}
            onChange={(e) => changeProduct(e.target.value as PricedProductId)}
          >
            {PRICED_PRODUCTS.map((product) => (
              <option key={product.id} value={product.id}>
                {product.label}
              </option>
            ))}
          </Select>
        </Field>
        {values.product === 'GARAGE_DOOR' ? (
          <Field label="Door style" htmlFor="productStyle">
            <Select
              id="productStyle"
              name="productStyle"
              value={values.productStyle}
              onChange={(e) => set('productStyle', e.target.value)}
            >
              <option value="">All styles</option>
              {GARAGE_STYLES.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="productStyle" value="" />
        )}
      </div>

      <Field
        label="Brand (optional)"
        htmlFor="productBrand"
        hint="The brand you supply, e.g. Gliderol or DoorWorks. Leave blank if you don’t name one."
      >
        <Input
          id="productBrand"
          name="productBrand"
          maxLength={60}
          value={values.productBrand}
          onChange={(e) => set('productBrand', e.target.value)}
        />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-graphite">
          Sizes this price covers (mm, both ends included)
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['minWidthMm', 'Width from'],
              ['maxWidthMm', 'Width to'],
              ['minHeightMm', 'Height from'],
              ['maxHeightMm', 'Height to'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-micro text-zinc-deep">{label}</span>
              <Input
                name={key}
                type="number"
                inputMode="numeric"
                min={100}
                max={20000}
                step={1}
                required
                value={values[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {hasMotor ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-graphite">Motor</legend>
          <Segmented
            name="motorIncluded"
            value={values.motorIncluded ? 'yes' : 'no'}
            options={[
              { id: 'yes', label: 'Motor included' },
              { id: 'no', label: 'No motor' },
            ]}
            onChange={(v) => set('motorIncluded', v === 'yes')}
          />
          {values.motorIncluded && (
            <div className="mt-3 max-w-sm">
              {listedMotors.length > 0 ? (
                <Field
                  label="Motor brand"
                  htmlFor="motorBrand"
                  hint="Customers asking for a brand only match prices that name it."
                >
                  <Select
                    id="motorBrand"
                    name="motorBrand"
                    value={values.motorBrand}
                    onChange={(e) => set('motorBrand', e.target.value)}
                  >
                    <option value="">Not specified</option>
                    {listedMotors.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field
                  label="Motor (optional)"
                  htmlFor="motorBrand"
                  hint="Shown on the quote, e.g. the opener model you fit."
                >
                  <Input
                    id="motorBrand"
                    name="motorBrand"
                    maxLength={60}
                    value={values.motorBrand}
                    onChange={(e) => set('motorBrand', e.target.value)}
                  />
                </Field>
              )}
            </div>
          )}
        </fieldset>
      ) : (
        <input type="hidden" name="motorIncluded" value="no" />
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-graphite">Installation</legend>
        <Segmented
          name="installation"
          value={values.installation}
          options={[
            { id: 'INCLUDED', label: 'Included in price' },
            { id: 'SEPARATE', label: 'Priced separately' },
            { id: 'NOT_INCLUDED', label: 'Supply only' },
          ]}
          onChange={(v) => set('installation', v)}
        />
        {values.installation === 'SEPARATE' && (
          <div className="mt-3 max-w-xs">
            <Field
              label="Installation price ($)"
              htmlFor="installPrice"
              hint="Same GST treatment as the main price."
            >
              <Input
                id="installPrice"
                name="installPrice"
                inputMode="decimal"
                required
                value={values.installPrice}
                onChange={(e) => set('installPrice', e.target.value)}
              />
            </Field>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price ($)" htmlFor="price">
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            required
            placeholder="3000"
            value={values.price}
            onChange={(e) => set('price', e.target.value)}
          />
        </Field>
        <Field label="GST" htmlFor="gst">
          <Select
            id="gst"
            name="gst"
            value={values.gst}
            onChange={(e) => set('gst', e.target.value as GstTreatmentId)}
          >
            <option value="EXCLUSIVE">Price plus GST</option>
            <option value="INCLUSIVE">Price includes GST</option>
          </Select>
        </Field>
      </div>

      <PricePreview values={values} />

      <Field label="Note on the quote (optional)" htmlFor="note" hint="e.g. what’s included, lead time.">
        <Textarea
          id="note"
          name="note"
          maxLength={300}
          className="min-h-20"
          value={values.note}
          onChange={(e) => set('note', e.target.value)}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-graphite">
        <input
          type="checkbox"
          name="active"
          checked={values.active}
          onChange={(e) => set('active', e.target.checked)}
          className="h-4 w-4 accent-signal"
        />
        Use this price for automated quotes
      </label>

      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : values.id ? 'Save changes' : 'Add price'}
        </Button>
        {values.id && (
          <Link href="/pricing" className="text-sm font-medium text-signal hover:text-signal-hover">
            Cancel
          </Link>
        )}
      </div>
    </form>
  )
}
