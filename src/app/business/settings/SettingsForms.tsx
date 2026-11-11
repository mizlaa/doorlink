'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { keepValuesOnSubmit } from '@/lib/keep-form-values'
import { AU_TIMEZONES } from '@/lib/timezone'
import { removeLogoAction, saveSettingsAction, uploadLogoAction, type SettingsState } from './actions'

function Result({ state }: { state: SettingsState }) {
  if (state.error) return <p role="alert" className="text-sm text-bad">{state.error}</p>
  if (state.message) return <p role="status" className="text-sm text-good">{state.message}</p>
  return null
}

export function LogoUploadForm({ hasLogo }: { hasLogo: boolean }) {
  const [state, action, pending] = useActionState(uploadLogoAction, {})
  const [removed, remove, removing] = useActionState(removeLogoAction, {})
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        <Field label="Upload your logo" htmlFor="logo" hint="PNG or JPEG, up to 2 MB. A wide logo on a white or clear background works best.">
          <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg" required className="h-auto py-2" />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Uploading…' : 'Upload logo'}
        </Button>
        <Result state={state} />
      </form>
      {hasLogo && (
        <form action={remove}>
          <Button type="submit" variant="ghost" className="text-bad" disabled={removing}>
            Remove logo
          </Button>
          <Result state={removed} />
        </form>
      )}
    </div>
  )
}

export function SettingsForm({
  values,
  abnValid,
}: {
  values: { gstRegistered: boolean; invoiceTermsDays: number; timezone: string; addressLine: string; invoiceFooter: string; showPhone: boolean; showEmail: boolean; showAbn: boolean; showAddress: boolean }
  abnValid: boolean
}) {
  const [state, action, pending] = useActionState(saveSettingsAction, {})
  return (
    <form action={action} onSubmit={keepValuesOnSubmit(action)} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-graphite">Are you registered for GST?</legend>
        <label className="flex items-start gap-3 rounded border border-line bg-rail p-3 text-sm has-[:checked]:border-signal">
          <input type="radio" name="gstRegistered" value="yes" defaultChecked={values.gstRegistered} className="mt-0.5" />
          <span>
            <span className="font-medium text-graphite">Yes</span>
            <span className="block text-micro text-zinc-deep">Invoices are tax invoices showing your ABN and the GST. {!abnValid && 'Add a valid ABN in your business details first, or invoices will go out without GST.'}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded border border-line bg-rail p-3 text-sm has-[:checked]:border-signal">
          <input type="radio" name="gstRegistered" value="no" defaultChecked={!values.gstRegistered} className="mt-0.5" />
          <span>
            <span className="font-medium text-graphite">No</span>
            <span className="block text-micro text-zinc-deep">Invoices are titled “Invoice” and charge no GST, as the ATO requires.</span>
          </span>
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment terms (days)" htmlFor="invoiceTermsDays" hint="0 means due on receipt.">
          <Input id="invoiceTermsDays" name="invoiceTermsDays" type="number" min={0} max={90} required defaultValue={values.invoiceTermsDays} />
        </Field>
        <Field label="Time zone" htmlFor="timezone" hint="Appointments and invoice dates use it.">
          <Select id="timezone" name="timezone" defaultValue={values.timezone}>
            {AU_TIMEZONES.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Street address (optional)" htmlFor="addressLine" hint="Printed on invoices. Your suburb, state and postcode come from your business details.">
        <Input id="addressLine" name="addressLine" maxLength={120} defaultValue={values.addressLine} autoComplete="street-address" />
      </Field>

      <Field label="Invoice footer (optional)" htmlFor="invoiceFooter" hint="How to pay you: bank name, BSB and account, or a thank-you note.">
        <Textarea id="invoiceFooter" name="invoiceFooter" maxLength={600} defaultValue={values.invoiceFooter} className="min-h-24" />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-graphite">Show on your public Doorlink profile</legend>
        <p className="text-micro text-zinc-deep">Your business name, suburb, logo and service areas always show. Invoices always carry your full details.</p>
        {(
          [
            ['showPhone', 'Phone number', values.showPhone],
            ['showEmail', 'Email address', values.showEmail],
            ['showAbn', 'ABN', values.showAbn],
            ['showAddress', 'Street address', values.showAddress],
          ] as const
        ).map(([name, label, checked]) => (
          <label key={name} className="flex min-h-11 items-center gap-3 text-sm text-graphite">
            <input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4" />
            {label}
          </label>
        ))}
      </fieldset>

      <Button type="submit" size="lg" className="h-12" disabled={pending}>
        {pending ? 'Saving…' : 'Save settings'}
      </Button>
      <Result state={state} />
    </form>
  )
}
