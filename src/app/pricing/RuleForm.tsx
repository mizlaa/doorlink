'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import type { GstTreatment, InstallationMode, QuoteProductCategory } from '@prisma/client'
import { saveRuleAction, type FormState } from './actions'
import { CATEGORIES, categoryInfo } from '@/lib/quoting/catalogue'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

export interface RuleFormValues {
  id?: string
  category: QuoteProductCategory
  brand: string
  widthMinMm: string
  widthMaxMm: string
  heightMinMm: string
  heightMaxMm: string
  motorIncluded: boolean
  motorBrand: string
  installation: InstallationMode
  installPrice: string
  price: string
  gst: GstTreatment
  notes: string
}

export const EMPTY_RULE: RuleFormValues = {
  category: 'GARAGE_DOOR', brand: '', widthMinMm: '', widthMaxMm: '', heightMinMm: '', heightMaxMm: '',
  motorIncluded: true, motorBrand: '', installation: 'INCLUDED', installPrice: '', price: '', gst: 'EXCLUSIVE', notes: '',
}

export function RuleForm({ initial }: { initial: RuleFormValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRuleAction, {})
  const [category, setCategory] = useState(initial.category)
  const [motorIncluded, setMotorIncluded] = useState(initial.motorIncluded)
  const [installation, setInstallation] = useState(initial.installation)
  const info = categoryInfo(category)
  const e = state.errors ?? {}
  const showMotor = info.motorPolicy !== 'none'

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      {(state.error || e.overlap) && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/5 p-3 text-sm text-bad">
          {state.error ?? e.overlap}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product" htmlFor="category" error={e.category}>
          <Select id="category" name="category" value={category} onChange={(ev) => { setCategory(ev.target.value as QuoteProductCategory); if (categoryInfo(ev.target.value as QuoteProductCategory).motorPolicy === 'none') setMotorIncluded(false) }}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Brand"
          htmlFor="brand"
          error={e.brand}
          hint={info.brandExamples.length ? `Optional. For example ${info.brandExamples.join(' or ')}. Customers who choose a brand only match this brand.` : 'Optional. Leave blank if you do not sell this under a brand name.'}
        >
          <Input id="brand" name="brand" defaultValue={initial.brand} maxLength={80} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-graphite">Sizes this price covers (mm, both ends included)</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label={`${info.widthLabel} from`} htmlFor="widthMinMm" error={e.widthMinMm}>
            <Input id="widthMinMm" name="widthMinMm" inputMode="numeric" defaultValue={initial.widthMinMm} required />
          </Field>
          <Field label="to" htmlFor="widthMaxMm">
            <Input id="widthMaxMm" name="widthMaxMm" inputMode="numeric" defaultValue={initial.widthMaxMm} required />
          </Field>
          <Field label={`${info.heightLabel} from`} htmlFor="heightMinMm" error={e.heightMinMm}>
            <Input id="heightMinMm" name="heightMinMm" inputMode="numeric" defaultValue={initial.heightMinMm} required />
          </Field>
          <Field label="to" htmlFor="heightMaxMm">
            <Input id="heightMaxMm" name="heightMaxMm" inputMode="numeric" defaultValue={initial.heightMaxMm} required />
          </Field>
        </div>
      </fieldset>

      {showMotor ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Motor" htmlFor="motorIncluded" error={e.motorIncluded}>
            <Select id="motorIncluded" name="motorIncluded" value={motorIncluded ? 'yes' : 'no'} onChange={(ev) => setMotorIncluded(ev.target.value === 'yes')}>
              <option value="yes">Motor included</option>
              <option value="no">No motor</option>
            </Select>
          </Field>
          {motorIncluded && (
            info.motorPolicy === 'list' ? (
              <Field label="Motor brand" htmlFor="motorBrand" error={e.motorBrand} hint="Only quote a motor you supply and fit on this product at these sizes.">
                <Select id="motorBrand" name="motorBrand" defaultValue={initial.motorBrand}>
                  <option value="">Choose…</option>
                  {info.motorBrands.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Motor brand" htmlFor="motorBrand" error={e.motorBrand} hint="Optional.">
                <Input id="motorBrand" name="motorBrand" defaultValue={initial.motorBrand} maxLength={80} />
              </Field>
            )
          )}
        </div>
      ) : (
        <p className="text-sm text-zinc-deep">{info.plural} do not take a motor.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Installation" htmlFor="installation" error={e.installation}>
          <Select id="installation" name="installation" value={installation} onChange={(ev) => setInstallation(ev.target.value as InstallationMode)}>
            <option value="INCLUDED">Included in the price</option>
            <option value="EXTRA">Available at extra cost</option>
            <option value="NOT_OFFERED">Supply only, no installation</option>
          </Select>
        </Field>
        {installation === 'EXTRA' && (
          <Field label="Installation price (AUD)" htmlFor="installPrice" error={e.installPriceCents} hint="Same GST treatment as the price.">
            <Input id="installPrice" name="installPrice" inputMode="decimal" defaultValue={initial.installPrice} />
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price (AUD)" htmlFor="price" error={e.priceCents}>
          <Input id="price" name="price" inputMode="decimal" defaultValue={initial.price} required />
        </Field>
        <Field label="GST" htmlFor="gst" error={e.gst}>
          <Select id="gst" name="gst" defaultValue={initial.gst}>
            <option value="EXCLUSIVE">Charged on top (price + GST)</option>
            <option value="INCLUSIVE">Already included in the price</option>
          </Select>
        </Field>
      </div>

      <Field label="Notes shown on the quote" htmlFor="notes" error={e.notes} hint="Optional. What the price covers or excludes.">
        <Textarea id="notes" name="notes" defaultValue={initial.notes} maxLength={500} rows={3} />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : initial.id ? 'Save changes' : 'Add this price'}</Button>
        <Link href="/pricing" className="text-sm font-medium text-signal hover:text-signal-hover">Cancel</Link>
      </div>
    </form>
  )
}
