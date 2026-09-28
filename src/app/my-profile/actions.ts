'use server'

import { revalidatePath } from 'next/cache'
import { VerificationStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, type Session } from '@/lib/auth'
import { can, requireSession, RbacError } from '@/lib/rbac'
import { isDatabaseUnreachable, isRecordNotFound } from '@/lib/db-errors'
import { toMinorUnits } from '@/lib/money'
import { AU_POSTCODE_PATTERN, AU_STATES } from '@/lib/australia'
import { parseTime, windowProblem } from '@/lib/availability'
import {
  canSubmitForVerification,
  canWithdrawVerification,
  ensureTechnicianProfile,
  missingForVerification,
} from '@/lib/technician'
import { requireTradeSubscription, isTradeSubscriptionRequiredError } from '@/lib/trade-subscription'

export type ProfileActionState = { error?: string; ok?: boolean }

async function requireTechnician(): Promise<Session> {
  const session = requireSession(await getSession())
  if (!can(session.role, 'marketplace:quote')) {
    throw new RbacError('Only technician accounts have a trade profile.', 403)
  }
  await requireTradeSubscription(session)
  return session
}

/**
 * Every action here opens the same way: prove the caller is a
 * technician, get (or lazily create) their profile row, and turn the two
 * database failures worth distinguishing into messages a person can read.
 * Doing it once means no action can quietly skip the permission check.
 */
async function withProfile(
  run: (profileId: string, session: Session) => Promise<ProfileActionState>
): Promise<ProfileActionState> {
  let session: Session
  try {
    session = await requireTechnician()
  } catch (error) {
    if (error instanceof RbacError) return { error: error.message }
    if (isTradeSubscriptionRequiredError(error)) return { error: error.message }
    throw error
  }

  try {
    const profile = await ensureTechnicianProfile(session.userId)
    return await run(profile.id, session)
  } catch (error) {
    if (isRecordNotFound(error)) return { error: 'Your profile could not be found.' }
    if (isDatabaseUnreachable(error)) return { error: 'The database is not reachable right now.' }
    throw error
  }
}

// The public profile is a separate route with its own cache entry, so
// editing your details has to invalidate it too — otherwise a customer
// comparing quotes can be shown a version of you from before your last
// edit.
function refresh(userId: string) {
  revalidatePath('/my-profile')
  revalidatePath('/leads')
  revalidatePath(`/technicians/${userId}`)
}

// ---------------------------------------------------------------------
// About you
// ---------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))

const detailsSchema = z.object({
  businessName: optionalText(120),
  businessPhone: optionalText(40),
  abn: optionalText(20),
  headline: optionalText(140),
  bio: optionalText(3000),
  yearsExperience: z
    .union([z.coerce.number().int().min(0).max(70), z.literal('')])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : Number(value))),
  acceptingWork: z.boolean(),
})

export async function updateDetailsAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const parsed = detailsSchema.safeParse({
      businessName: formData.get('businessName') ?? undefined,
      businessPhone: formData.get('businessPhone') ?? undefined,
      abn: formData.get('abn') ?? undefined,
      headline: formData.get('headline') ?? undefined,
      bio: formData.get('bio') ?? undefined,
      yearsExperience: formData.get('yearsExperience') ?? undefined,
      acceptingWork: formData.get('acceptingWork') === 'on',
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
    }

    await prisma.technicianProfile.update({ where: { id: profileId }, data: parsed.data })
    refresh(session.userId)
    return { ok: true }
  })
}

// ---------------------------------------------------------------------
// Where you work
// ---------------------------------------------------------------------

const baseSchema = z.object({
  baseSuburb: optionalText(120),
  baseState: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine((value) => value === null || (AU_STATES as readonly string[]).includes(value), {
      message: 'Choose an Australian state or territory.',
    }),
  basePostcode: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine((value) => value === null || AU_POSTCODE_PATTERN.test(value), {
      message: 'A postcode is four digits.',
    }),
  serviceRadiusKm: z
    .union([z.coerce.number().int().min(1).max(2000), z.literal('')])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : Number(value))),
})

export async function updateBaseAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const parsed = baseSchema.safeParse({
      baseSuburb: formData.get('baseSuburb') ?? undefined,
      baseState: formData.get('baseState') ?? undefined,
      basePostcode: formData.get('basePostcode') ?? undefined,
      serviceRadiusKm: formData.get('serviceRadiusKm') ?? undefined,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
    }

    await prisma.technicianProfile.update({ where: { id: profileId }, data: parsed.data })
    refresh(session.userId)
    return { ok: true }
  })
}

const areaSchema = z.object({
  postcode: z.string().trim().regex(AU_POSTCODE_PATTERN, 'A postcode is four digits.'),
  suburb: optionalText(120),
  state: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
})

export async function addServiceAreaAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const parsed = areaSchema.safeParse({
      postcode: formData.get('postcode'),
      suburb: formData.get('suburb') ?? undefined,
      state: formData.get('state') ?? undefined,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Check the postcode and try again.' }
    }

    // Upsert rather than create: adding a postcode you already cover
    // should update the suburb label, not throw a unique-constraint
    // error at someone who was only trying to fix a typo.
    await prisma.workerServiceArea.upsert({
      where: { workerId_postcode: { workerId: profileId, postcode: parsed.data.postcode } },
      update: { suburb: parsed.data.suburb, state: parsed.data.state },
      create: {
        workerId: profileId,
        postcode: parsed.data.postcode,
        suburb: parsed.data.suburb,
        state: parsed.data.state,
      },
    })
    refresh(session.userId)
    return { ok: true }
  })
}

export async function removeServiceAreaAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const id = String(formData.get('areaId') ?? '')
    if (!id) return { error: 'Missing area.' }

    // Scoped by workerId as well as id: the id alone came from a form,
    // and a form is not proof of ownership.
    const removed = await prisma.workerServiceArea.deleteMany({ where: { id, workerId: profileId } })
    if (removed.count === 0) return { error: 'That area is no longer on your profile.' }
    refresh(session.userId)
    return { ok: true }
  })
}

// ---------------------------------------------------------------------
// What you do
// ---------------------------------------------------------------------

const serviceSchema = z.object({
  categoryId: z.string().trim().min(1, 'Choose a service.'),
  fromPrice: z
    .union([z.coerce.number().min(0).max(1_000_000), z.literal('')])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : Number(value))),
  note: optionalText(240),
})

export async function addServiceAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const parsed = serviceSchema.safeParse({
      categoryId: formData.get('categoryId'),
      fromPrice: formData.get('fromPrice') ?? undefined,
      note: formData.get('note') ?? undefined,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
    }

    const category = await prisma.serviceCategory.findUnique({ where: { id: parsed.data.categoryId } })
    if (!category) return { error: 'That service no longer exists.' }

    const fromPriceCents = parsed.data.fromPrice === null ? null : toMinorUnits(parsed.data.fromPrice)

    await prisma.workerService.upsert({
      where: { workerId_categoryId: { workerId: profileId, categoryId: category.id } },
      update: { fromPriceCents, note: parsed.data.note },
      create: { workerId: profileId, categoryId: category.id, fromPriceCents, note: parsed.data.note },
    })
    refresh(session.userId)
    return { ok: true }
  })
}

export async function removeServiceAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const id = String(formData.get('serviceId') ?? '')
    if (!id) return { error: 'Missing service.' }

    const removed = await prisma.workerService.deleteMany({ where: { id, workerId: profileId } })
    if (removed.count === 0) return { error: 'That service is no longer on your profile.' }
    refresh(session.userId)
    return { ok: true }
  })
}

// ---------------------------------------------------------------------
// Credentials and verification
// ---------------------------------------------------------------------

const credentialsSchema = z.object({
  licenceNumber: optionalText(60),
  insurerName: optionalText(120),
  insurancePolicyNumber: optionalText(60),
  insuranceExpiresAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? new Date(value) : null))
    .refine((value) => value === null || !Number.isNaN(value.getTime()), {
      message: 'That expiry date could not be read.',
    }),
})

export async function updateCredentialsAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const parsed = credentialsSchema.safeParse({
      licenceNumber: formData.get('licenceNumber') ?? undefined,
      insurerName: formData.get('insurerName') ?? undefined,
      insurancePolicyNumber: formData.get('insurancePolicyNumber') ?? undefined,
      insuranceExpiresAt: formData.get('insuranceExpiresAt') ?? undefined,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
    }

    await prisma.technicianProfile.update({ where: { id: profileId }, data: parsed.data })
    refresh(session.userId)
    return { ok: true }
  })
}

export async function submitForVerificationAction(
  _prevState: ProfileActionState,
  _formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const profile = await prisma.technicianProfile.findUniqueOrThrow({ where: { id: profileId } })

    if (!canSubmitForVerification(profile.verificationStatus)) {
      return { error: 'Your details are already with Doorlink for review.' }
    }

    const missing = missingForVerification(profile)
    if (missing.length > 0) {
      return { error: `Before submitting, add ${missing.join(', ')}.` }
    }

    // SUBMITTED means "a human at Doorlink has been asked to look at
    // this", and nothing more. It does not set `verified`, and no code
    // path anywhere moves a profile to VERIFIED on its own — there is no
    // verification service connected, so claiming otherwise would be a
    // claim about a real person's credentials that nobody has checked.
    await prisma.technicianProfile.update({
      where: { id: profileId },
      data: { verificationStatus: VerificationStatus.SUBMITTED, verificationNote: null },
    })
    refresh(session.userId)
    return { ok: true }
  })
}

export async function withdrawVerificationAction(
  _prevState: ProfileActionState,
  _formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const profile = await prisma.technicianProfile.findUniqueOrThrow({ where: { id: profileId } })
    if (!canWithdrawVerification(profile.verificationStatus)) {
      return { error: 'There is nothing to withdraw.' }
    }

    await prisma.technicianProfile.update({
      where: { id: profileId },
      data: { verificationStatus: VerificationStatus.UNVERIFIED },
    })
    refresh(session.userId)
    return { ok: true }
  })
}

// ---------------------------------------------------------------------
// Certifications
// ---------------------------------------------------------------------

const certificationSchema = z.object({
  name: z.string().trim().min(2, 'Name the certification.').max(140),
  issuer: optionalText(140),
  reference: optionalText(80),
  issuedAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? new Date(value) : null)),
  expiresAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? new Date(value) : null)),
})

export async function addCertificationAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const parsed = certificationSchema.safeParse({
      name: formData.get('name'),
      issuer: formData.get('issuer') ?? undefined,
      reference: formData.get('reference') ?? undefined,
      issuedAt: formData.get('issuedAt') ?? undefined,
      expiresAt: formData.get('expiresAt') ?? undefined,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
    }

    // `verified` stays false. A technician typing a certificate's name in
    // is a claim, not a check, and the public profile labels it as one.
    await prisma.workerCertification.create({ data: { workerId: profileId, ...parsed.data } })
    refresh(session.userId)
    return { ok: true }
  })
}

export async function removeCertificationAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const id = String(formData.get('certificationId') ?? '')
    if (!id) return { error: 'Missing certification.' }

    const removed = await prisma.workerCertification.deleteMany({ where: { id, workerId: profileId } })
    if (removed.count === 0) return { error: 'That certification is no longer on your profile.' }
    refresh(session.userId)
    return { ok: true }
  })
}

// ---------------------------------------------------------------------
// Working hours
// ---------------------------------------------------------------------

export async function addAvailabilityAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const dayOfWeek = Number(formData.get('dayOfWeek'))
    const startMinute = parseTime(String(formData.get('startTime') ?? ''))
    const endMinute = parseTime(String(formData.get('endTime') ?? ''))

    if (startMinute === null) return { error: 'Enter a start time.' }
    if (endMinute === null) return { error: 'Enter a finish time.' }

    // Overlap is checked against what is in the database now, not against
    // what the page was rendered with — two tabs open on this form would
    // otherwise be able to write a pair of windows that each looked fine
    // on its own.
    const existing = await prisma.workerAvailability.findMany({
      where: { workerId: profileId, dayOfWeek },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    })

    const problem = windowProblem({ dayOfWeek, startMinute, endMinute }, existing)
    if (problem) return { error: problem }

    await prisma.workerAvailability.create({
      data: { workerId: profileId, dayOfWeek, startMinute, endMinute },
    })
    refresh(session.userId)
    return { ok: true }
  })
}

export async function removeAvailabilityAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  return withProfile(async (profileId, session) => {
    const id = String(formData.get('availabilityId') ?? '')
    if (!id) return { error: 'Missing window.' }

    const removed = await prisma.workerAvailability.deleteMany({ where: { id, workerId: profileId } })
    if (removed.count === 0) return { error: 'Those hours are no longer on your profile.' }
    refresh(session.userId)
    return { ok: true }
  })
}
