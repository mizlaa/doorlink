'use client'

import { useActionState, useState } from 'react'
import type { ReactNode } from 'react'
import {
  addAvailabilityAction,
  addCertificationAction,
  addServiceAction,
  addServiceAreaAction,
  removeAvailabilityAction,
  removeCertificationAction,
  removeServiceAction,
  removeServiceAreaAction,
  submitForVerificationAction,
  updateBaseAction,
  updateCredentialsAction,
  updateDetailsAction,
  withdrawVerificationAction,
  type ProfileActionState,
} from './actions'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { AU_STATES } from '@/lib/australia'
import { DAY_LABELS, WEEK_ORDER, formatWindow, groupByDay } from '@/lib/availability'
import { formatMoney } from '@/lib/money'

const initial: ProfileActionState = {}

function FormStatus({ state, savedLabel = 'Saved.' }: { state: ProfileActionState; savedLabel?: string }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-bad">
        {state.error}
      </p>
    )
  }
  if (state.ok) return <p className="text-sm text-good">{savedLabel}</p>
  return null
}

// ---------------------------------------------------------------------

export function DetailsForm({
  profile,
}: {
  profile: {
    businessName: string | null
    businessPhone: string | null
    abn: string | null
    headline: string | null
    bio: string | null
    yearsExperience: number | null
    acceptingWork: boolean
  }
}) {
  const [state, formAction, isPending] = useActionState(updateDetailsAction, initial)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business or trading name" htmlFor="businessName" hint="What customers will see.">
          <Input
            id="businessName"
            name="businessName"
            defaultValue={profile.businessName ?? ''}
            maxLength={120}
          />
        </Field>
        <Field label="Contact number" htmlFor="businessPhone" hint="Shared only once someone hires you.">
          <Input
            id="businessPhone"
            name="businessPhone"
            type="tel"
            defaultValue={profile.businessPhone ?? ''}
            maxLength={40}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ABN" htmlFor="abn" hint="Optional here, required before verification.">
          <Input id="abn" name="abn" defaultValue={profile.abn ?? ''} maxLength={20} />
        </Field>
        <Field label="Years in the trade" htmlFor="yearsExperience">
          <Input
            id="yearsExperience"
            name="yearsExperience"
            type="number"
            min="0"
            max="70"
            step="1"
            inputMode="numeric"
            defaultValue={profile.yearsExperience ?? ''}
          />
        </Field>
      </div>

      <Field
        label="One-line summary"
        htmlFor="headline"
        hint='e.g. "Roller doors, sectional doors and automatic gates, Brisbane northside".'
      >
        <Input id="headline" name="headline" defaultValue={profile.headline ?? ''} maxLength={140} />
      </Field>

      <Field
        label="About your work"
        htmlFor="bio"
        hint="What you specialise in, what brands you know, how you work. Customers read this when comparing quotes."
      >
        <Textarea id="bio" name="bio" rows={6} defaultValue={profile.bio ?? ''} maxLength={3000} />
      </Field>

      <label className="flex items-start gap-3 rounded-md border border-line bg-rail p-3">
        <input
          type="checkbox"
          name="acceptingWork"
          defaultChecked={profile.acceptingWork}
          className="mt-0.5 h-4 w-4 accent-signal"
        />
        <span className="text-sm">
          <span className="font-medium text-graphite">Available for work</span>
          <span className="mt-0.5 block text-graphite-soft">
            Turn this off while you are booked out. Your profile stays up; you just stop being suggested for new
            jobs.
          </span>
        </span>
      </label>

      <FormStatus state={state} />
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save details'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------

export function BaseForm({
  profile,
}: {
  profile: {
    baseSuburb: string | null
    baseState: string | null
    basePostcode: string | null
    serviceRadiusKm: number | null
  }
}) {
  const [state, formAction, isPending] = useActionState(updateBaseAction, initial)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Base suburb" htmlFor="baseSuburb">
          <Input id="baseSuburb" name="baseSuburb" defaultValue={profile.baseSuburb ?? ''} maxLength={120} />
        </Field>
        <Field label="State" htmlFor="baseState">
          <Select id="baseState" name="baseState" defaultValue={profile.baseState ?? ''}>
            <option value="">Select one</option>
            {AU_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Postcode" htmlFor="basePostcode">
          <Input
            id="basePostcode"
            name="basePostcode"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            defaultValue={profile.basePostcode ?? ''}
          />
        </Field>
      </div>

      <Field
        label="How far you travel"
        htmlFor="serviceRadiusKm"
        hint="Kilometres from your base. Optional. The postcodes below are what actually matter."
      >
        <Input
          id="serviceRadiusKm"
          name="serviceRadiusKm"
          type="number"
          min="1"
          max="2000"
          step="1"
          inputMode="numeric"
          defaultValue={profile.serviceRadiusKm ?? ''}
          className="max-w-40"
        />
      </Field>

      <FormStatus state={state} />
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save location'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------

export function ServiceAreaEditor({
  areas,
}: {
  areas: Array<{ id: string; postcode: string; suburb: string | null; state: string | null }>
}) {
  const [state, formAction, isPending] = useActionState(addServiceAreaAction, initial)

  return (
    <div className="flex flex-col gap-4">
      {areas.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {areas.map((area) => (
            <li key={area.id}>
              <RemoveChip
                action={removeServiceAreaAction}
                name="areaId"
                value={area.id}
                label={[area.suburb, area.postcode].filter(Boolean).join(' ')}
              />
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <Field label="Postcode" htmlFor="postcode">
          <Input
            id="postcode"
            name="postcode"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
            className="w-28"
          />
        </Field>
        <Field label="Suburb" htmlFor="suburb">
          <Input id="suburb" name="suburb" maxLength={120} className="w-48" />
        </Field>
        <Field label="State" htmlFor="areaState">
          <Select id="areaState" name="state" className="w-28">
            <option value="">Select one</option>
            {AU_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add area'}
        </Button>
      </form>

      <FormStatus state={state} savedLabel="Area added." />
    </div>
  )
}

// ---------------------------------------------------------------------

export function ServiceEditor({
  services,
  categories,
}: {
  services: Array<{
    id: string
    fromPriceCents: number | null
    note: string | null
    category: { id: string; name: string }
  }>
  categories: Array<{ id: string; name: string }>
}) {
  const [state, formAction, isPending] = useActionState(addServiceAction, initial)
  const taken = new Set(services.map((s) => s.category.id))
  const available = categories.filter((c) => !taken.has(c.id))

  return (
    <div className="flex flex-col gap-4">
      {services.length > 0 && (
        <ul className="flex flex-col gap-2">
          {services.map((service) => (
            <li
              key={service.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-graphite">{service.category.name}</p>
                <p className="mt-0.5 text-micro text-zinc-deep">
                  {service.fromPriceCents !== null
                    ? `From ${formatMoney(service.fromPriceCents)}`
                    : 'No indicative price'}
                  {service.note && ` · ${service.note}`}
                </p>
              </div>
              <RemoveChip
                action={removeServiceAction}
                name="serviceId"
                value={service.id}
                label="Remove"
                bare
              />
            </li>
          ))}
        </ul>
      )}

      {available.length === 0 ? (
        <p className="text-sm text-zinc-deep">You have listed every service Doorlink offers.</p>
      ) : (
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <Field label="Service" htmlFor="categoryId">
            <Select id="categoryId" name="categoryId" required className="w-64">
              <option value="">Choose a service…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From (AUD)" htmlFor="fromPrice" hint="Optional.">
            <Input
              id="fromPrice"
              name="fromPrice"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="w-32"
            />
          </Field>
          <Field label="Note" htmlFor="note" hint="Optional.">
            <Input id="note" name="note" maxLength={240} className="w-64" />
          </Field>
          <Button type="submit" variant="secondary" disabled={isPending}>
            {isPending ? 'Adding…' : 'Add service'}
          </Button>
        </form>
      )}

      <FormStatus state={state} savedLabel="Service added." />
    </div>
  )
}

// ---------------------------------------------------------------------

export function CredentialsForm({
  profile,
}: {
  profile: {
    licenceNumber: string | null
    insurerName: string | null
    insurancePolicyNumber: string | null
    insuranceExpiresAt: Date | null
  }
}) {
  const [state, formAction, isPending] = useActionState(updateCredentialsAction, initial)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Licence number" htmlFor="licenceNumber">
        <Input
          id="licenceNumber"
          name="licenceNumber"
          defaultValue={profile.licenceNumber ?? ''}
          maxLength={60}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Insurer" htmlFor="insurerName">
          <Input id="insurerName" name="insurerName" defaultValue={profile.insurerName ?? ''} maxLength={120} />
        </Field>
        <Field label="Policy number" htmlFor="insurancePolicyNumber">
          <Input
            id="insurancePolicyNumber"
            name="insurancePolicyNumber"
            defaultValue={profile.insurancePolicyNumber ?? ''}
            maxLength={60}
          />
        </Field>
        <Field label="Expires" htmlFor="insuranceExpiresAt">
          <Input
            id="insuranceExpiresAt"
            name="insuranceExpiresAt"
            type="date"
            defaultValue={profile.insuranceExpiresAt?.toISOString().slice(0, 10) ?? ''}
          />
        </Field>
      </div>

      <FormStatus state={state} />
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save credentials'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------

export function VerificationControls({ mode }: { mode: 'submit' | 'withdraw' }) {
  const action = mode === 'submit' ? submitForVerificationAction : withdrawVerificationAction
  const [state, formAction, isPending] = useActionState(action, initial)

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" variant={mode === 'submit' ? 'primary' : 'secondary'} disabled={isPending}>
        {isPending ? 'Working…' : mode === 'submit' ? 'Send my details for review' : 'Withdraw my submission'}
      </Button>
      <FormStatus state={state} savedLabel={mode === 'submit' ? 'Sent for review.' : 'Withdrawn.'} />
    </form>
  )
}

// ---------------------------------------------------------------------

export function CertificationEditor({
  certifications,
}: {
  certifications: Array<{
    id: string
    name: string
    issuer: string | null
    reference: string | null
    expiresAt: Date | null
    verified: boolean
  }>
}) {
  const [state, formAction, isPending] = useActionState(addCertificationAction, initial)
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {certifications.length > 0 && (
        <ul className="flex flex-col gap-2">
          {certifications.map((cert) => (
            <li
              key={cert.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-graphite">{cert.name}</p>
                <p className="mt-0.5 text-micro text-zinc-deep">
                  {[
                    cert.issuer,
                    cert.reference,
                    cert.expiresAt &&
                      `expires ${cert.expiresAt.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', month: 'short', year: 'numeric' })}`,
                    cert.verified ? 'checked by Doorlink' : 'not yet checked',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <RemoveChip
                action={removeCertificationAction}
                name="certificationId"
                value={cert.id}
                label="Remove"
                bare
              />
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <div>
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            Add a certification
          </Button>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4 rounded-md border border-line bg-rail p-4">
          <Field label="Certification" htmlFor="name">
            <Input id="name" name="name" required minLength={2} maxLength={140} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issued by" htmlFor="issuer">
              <Input id="issuer" name="issuer" maxLength={140} />
            </Field>
            <Field label="Reference number" htmlFor="reference">
              <Input id="reference" name="reference" maxLength={80} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issued" htmlFor="issuedAt">
              <Input id="issuedAt" name="issuedAt" type="date" />
            </Field>
            <Field label="Expires" htmlFor="expiresAt">
              <Input id="expiresAt" name="expiresAt" type="date" />
            </Field>
          </div>
          <FormStatus state={state} savedLabel="Certification added." />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add certification'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------

/**
 * A one-field form rather than a button with an onClick: removal is a
 * write, so it goes through a server action with its own ownership check
 * rather than a client-side handler.
 */
function RemoveChip({
  action,
  name,
  value,
  label,
  bare,
}: {
  action: (state: ProfileActionState, formData: FormData) => Promise<ProfileActionState>
  name: string
  value: string
  label: ReactNode
  bare?: boolean
}) {
  const [state, formAction, isPending] = useActionState(action, initial)

  return (
    <form action={formAction} className="inline-flex flex-col items-start">
      <input type="hidden" name={name} value={value} />
      {bare ? (
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 text-sm font-medium text-signal hover:text-signal-hover disabled:opacity-50"
        >
          {isPending ? 'Removing…' : label}
        </button>
      ) : (
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded border border-line bg-paper px-3 py-1.5 text-sm text-graphite hover:border-signal disabled:opacity-50"
        >
          <span className="font-code">{label}</span>
          <span aria-hidden="true" className="text-zinc-deep">
            ✕
          </span>
          <span className="sr-only">Remove</span>
        </button>
      )}
      {state.error && <span className="text-micro text-bad">{state.error}</span>}
    </form>
  )
}

export function AvailabilityEditor({
  availability,
}: {
  availability: Array<{ id: string; dayOfWeek: number; startMinute: number; endMinute: number }>
}) {
  const [state, formAction, isPending] = useActionState(addAvailabilityAction, initial)
  const days = groupByDay(availability)

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {days.map((day) => (
          <li key={day.dayOfWeek} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-baseline sm:gap-4">
            <span className="w-24 shrink-0 text-sm font-medium text-graphite">{day.label}</span>

            {day.windows.length === 0 ? (
              // Said, not omitted — a day missing from the list reads as an
              // oversight rather than as a day off.
              <span className="text-sm text-zinc-deep">Not working</span>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {day.windows.map((window) => (
                  <li key={window.id}>
                    <RemoveChip
                      action={removeAvailabilityAction}
                      name="availabilityId"
                      value={window.id}
                      label={formatWindow(window)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <Field label="Day" htmlFor="dayOfWeek">
          <Select id="dayOfWeek" name="dayOfWeek" defaultValue="1" className="w-36">
            {WEEK_ORDER.map((day) => (
              <option key={day} value={day}>
                {DAY_LABELS[day]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="startTime">
          <Input id="startTime" name="startTime" type="time" defaultValue="07:00" required className="w-36" />
        </Field>
        <Field label="Until" htmlFor="endTime">
          <Input id="endTime" name="endTime" type="time" defaultValue="17:00" required className="w-36" />
        </Field>
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add hours'}
        </Button>
      </form>

      <FormStatus state={state} savedLabel="Hours added." />
    </div>
  )
}
