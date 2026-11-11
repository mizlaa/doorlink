'use server'

import { limitFor, tooManyMessage } from '@/lib/rate-limit'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { LeadStatus, UrgencyLevel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { makeReference } from '@/lib/reference'
import { toMinorUnits } from '@/lib/money'

export type RequestFormState = { error?: string }

const URGENCIES = ['EMERGENCY', 'URGENT', 'STANDARD', 'FLEXIBLE'] as const

// No sign-in required to post a request — name/email/phone are captured
// in the form itself, matching the low-friction contact-by-email pattern
// the rest of the product already uses. Signing in only adds the ability
// to track the request and compare quotes afterwards.
const createLeadSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
    phone: z.string().trim().optional(),
    title: z.string().trim().min(1, 'Give the job a short title.').max(120),
    message: z.string().trim().min(20, 'Describe the problem in a bit more detail (at least 20 characters).'),
    serviceCategoryId: z.string().trim().optional(),
    suburb: z.string().trim().optional(),
    state: z.string().trim().optional(),
    postcode: z.string().trim().optional(),
    urgency: z.enum(URGENCIES).default('STANDARD'),
    preferredTiming: z.string().trim().optional(),
    budgetMin: z.coerce.number().nonnegative().optional(),
    budgetMax: z.coerce.number().nonnegative().optional(),
    modelId: z.string().trim().optional(),
  })
  .refine(
    (data) => data.budgetMin === undefined || data.budgetMax === undefined || data.budgetMax >= data.budgetMin,
    { message: 'The top of your budget must be at least the bottom of it.', path: ['budgetMax'] }
  )

function optionalString(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : undefined
}

export async function createLeadAction(
  _prevState: RequestFormState,
  formData: FormData
): Promise<RequestFormState> {
  const limited = await limitFor('publicForm')
  if (!limited.ok) return { error: tooManyMessage(limited) }
  const parsed = createLeadSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: optionalString(formData.get('phone')),
    title: formData.get('title'),
    message: formData.get('message'),
    serviceCategoryId: optionalString(formData.get('serviceCategoryId')),
    suburb: optionalString(formData.get('suburb')),
    state: optionalString(formData.get('state')),
    postcode: optionalString(formData.get('postcode')),
    urgency: optionalString(formData.get('urgency')) ?? 'STANDARD',
    preferredTiming: optionalString(formData.get('preferredTiming')),
    budgetMin: optionalString(formData.get('budgetMin')),
    budgetMax: optionalString(formData.get('budgetMax')),
    modelId: optionalString(formData.get('modelId')),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const session = await getSession()
  let reference: string

  try {
    const lead = await prisma.lead.create({
      data: {
        reference: makeReference('LEAD'),
        // Linked to the account when there is one, so the customer can
        // track quotes. Anonymous requests still work; they just can't
        // be followed from a dashboard.
        customerId: session?.userId ?? null,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone ?? null,
        title: parsed.data.title,
        message: parsed.data.message,
        serviceCategoryId: parsed.data.serviceCategoryId ?? null,
        suburb: parsed.data.suburb ?? null,
        state: parsed.data.state ?? null,
        postcode: parsed.data.postcode ?? null,
        urgency: UrgencyLevel[parsed.data.urgency],
        preferredTiming: parsed.data.preferredTiming ?? null,
        budgetMinCents: parsed.data.budgetMin !== undefined ? toMinorUnits(parsed.data.budgetMin) : null,
        budgetMaxCents: parsed.data.budgetMax !== undefined ? toMinorUnits(parsed.data.budgetMax) : null,
        modelId: parsed.data.modelId ?? null,
        status: LeadStatus.OPEN_FOR_QUOTES,
      },
    })
    reference = lead.reference
  } catch (error) {
    if (isDatabaseUnreachable(error)) return { error: 'The request database is not reachable right now.' }
    throw error
  }

  redirect(`/request-technician/thanks?ref=${encodeURIComponent(reference)}`)
}
