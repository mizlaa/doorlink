'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NotificationType, Role } from '@prisma/client'
import { audit } from '@/lib/audit'
import { getPendingMfaSession, getSession, type Session } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { limitFor, tooManyMessage } from '@/lib/rate-limit'
import { can } from '@/lib/rbac'
import { MFA_COOKIE } from '@/lib/session-cookie'
import { MFA_TTL_MS, mfaCookieValue } from './cookie'
import { adminMfaRequired } from './policy'
import { decryptSecret, encryptSecret, hashRecoveryCode, newRecoveryCodes, newSecret, verifyCode } from './totp'

export type MfaState = { error?: string; codes?: string[]; ok?: boolean; message?: string }

const safeNext = (value: FormDataEntryValue | null) => {
  const next = String(value ?? '')
  return next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

async function rememberSecondStep(userId: string) {
  ;(await cookies()).set(MFA_COOKIE, mfaCookieValue(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MFA_TTL_MS / 1000,
  })
}

async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = newRecoveryCodes()
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })) }),
  ])
  return codes
}

/** Step 1 of setting up: a fresh secret, stored unconfirmed until a code proves the app has it. */
export async function startMfaSetupAction(): Promise<void> {
  const session = await getSession()
  if (!session) redirect('/sign-in?next=/account/security')
  const existing = await prisma.mfaCredential.findUnique({ where: { userId: session.userId } })
  if (existing?.confirmedAt) redirect('/account/security')
  const secretEnc = encryptSecret(newSecret())
  await prisma.mfaCredential.upsert({ where: { userId: session.userId }, update: { secretEnc, confirmedAt: null, lastUsedStep: null }, create: { userId: session.userId, secretEnc } })
  redirect('/account/security?setup=1')
}

/** Step 2: the first code from the app turns it on and shows the recovery codes once. */
export async function confirmMfaSetupAction(_prev: MfaState, form: FormData): Promise<MfaState> {
  const session = await getSession()
  if (!session) return { error: 'Sign in again.' }
  const limited = await limitFor('mfaVerify', session.userId)
  if (!limited.ok) return { error: tooManyMessage(limited) }
  const credential = await prisma.mfaCredential.findUnique({ where: { userId: session.userId } })
  if (!credential || credential.confirmedAt) return { error: 'Start the set-up again.' }
  const step = verifyCode(decryptSecret(credential.secretEnc), String(form.get('code') ?? ''), null)
  if (step === null) return { error: 'That code didn’t match. Check the time on your phone and try the newest code.' }
  await prisma.mfaCredential.update({ where: { userId: session.userId }, data: { confirmedAt: new Date(), lastUsedStep: step } })
  const codes = await issueRecoveryCodes(session.userId)
  await rememberSecondStep(session.userId)
  await audit({ actorId: session.userId, action: 'auth.mfa.enabled', entityType: 'User', entityId: session.userId })
  return { ok: true, codes }
}

/**
 * The second step at sign-in: a code from the app, or one recovery code.
 * A used recovery code is spent, and the person is told how many are left.
 */
export async function verifyMfaAction(_prev: MfaState, form: FormData): Promise<MfaState> {
  const session = await getPendingMfaSession()
  if (!session) redirect(safeNext(form.get('next')))
  const limited = await limitFor('mfaVerify', session.userId)
  if (!limited.ok) return { error: tooManyMessage(limited) }
  const input = String(form.get('code') ?? '').trim()
  const credential = await prisma.mfaCredential.findUnique({ where: { userId: session.userId } })
  if (!credential?.confirmedAt) redirect(safeNext(form.get('next')))

  if (/^\d{6}$/.test(input.replace(/\s/g, ''))) {
    const step = verifyCode(decryptSecret(credential.secretEnc), input, credential.lastUsedStep)
    if (step === null) return { error: 'That code didn’t work. Use the newest one in your app.' }
    // Only one sign-in may use a given code: the update succeeds only if nobody got there first.
    const claimed = await prisma.mfaCredential.updateMany({ where: { userId: session.userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] }, data: { lastUsedStep: step } })
    if (claimed.count === 0) return { error: 'That code was just used. Wait for the next one.' }
    await rememberSecondStep(session.userId)
    await audit({ actorId: session.userId, action: 'auth.mfa.verified', entityType: 'User', entityId: session.userId })
    redirect(safeNext(form.get('next')))
  }

  const used = await prisma.mfaRecoveryCode.updateMany({ where: { userId: session.userId, codeHash: hashRecoveryCode(input), usedAt: null }, data: { usedAt: new Date() } })
  if (used.count === 0) return { error: 'That isn’t a code from your app or an unused recovery code.' }
  const left = await prisma.mfaRecoveryCode.count({ where: { userId: session.userId, usedAt: null } })
  await rememberSecondStep(session.userId)
  await audit({ actorId: session.userId, action: 'auth.mfa.recovery_code_used', entityType: 'User', entityId: session.userId, metadata: { remaining: left } })
  await notify({ userId: session.userId, type: NotificationType.SYSTEM, title: 'A recovery code was used to sign in', body: `${left} recovery code${left === 1 ? '' : 's'} left. If this wasn’t you, change your password and set up two-step sign-in again.`, href: '/account/security' })
  redirect(left <= 3 ? '/account/security?low=1' : safeNext(form.get('next')))
}

/** New recovery codes (the old ones stop working). Needs a current code. */
export async function regenerateRecoveryCodesAction(_prev: MfaState, form: FormData): Promise<MfaState> {
  const session = await getSession()
  if (!session) return { error: 'Sign in again.' }
  const ok = await checkCurrentCode(session, String(form.get('code') ?? ''))
  if (!ok.ok) return { error: ok.error }
  const codes = await issueRecoveryCodes(session.userId)
  await audit({ actorId: session.userId, action: 'auth.mfa.recovery_codes_regenerated', entityType: 'User', entityId: session.userId })
  return { ok: true, codes }
}

/** Turns two-step sign-in off. Admins can't: their accounts must keep it. */
export async function disableMfaAction(_prev: MfaState, form: FormData): Promise<MfaState> {
  const session = await getSession()
  if (!session) return { error: 'Sign in again.' }
  if (session.role === Role.ADMIN && adminMfaRequired()) return { error: 'Admin accounts must keep two-step sign-in on.' }
  const ok = await checkCurrentCode(session, String(form.get('code') ?? ''))
  if (!ok.ok) return { error: ok.error }
  await prisma.$transaction([prisma.mfaRecoveryCode.deleteMany({ where: { userId: session.userId } }), prisma.mfaCredential.delete({ where: { userId: session.userId } })])
  await audit({ actorId: session.userId, action: 'auth.mfa.disabled', entityType: 'User', entityId: session.userId })
  return { ok: true, message: 'Two-step sign-in is off.' }
}

/**
 * For someone who lost their phone and their recovery codes: an admin
 * (themselves past two-step sign-in) clears it after checking who they are
 * outside Doorlink. Recorded, and the person is told.
 */
export async function adminResetMfaAction(_prev: MfaState, form: FormData): Promise<MfaState> {
  const session = await getSession()
  if (!session || !can(session.role, 'admin:settings')) return { error: 'Admins only.' }
  const userId = String(form.get('userId') ?? '')
  const reason = String(form.get('reason') ?? '').trim()
  if (reason.length < 10) return { error: 'Say how you confirmed it’s really them (at least 10 characters).' }
  if (userId === session.userId) return { error: 'Ask another admin to reset your own.' }
  const deleted = await prisma.$transaction([prisma.mfaRecoveryCode.deleteMany({ where: { userId } }), prisma.mfaCredential.deleteMany({ where: { userId } })])
  if (deleted[1].count === 0) return { error: 'That account doesn’t have two-step sign-in.' }
  await audit({ actorId: session.userId, action: 'admin.mfa.reset', entityType: 'User', entityId: userId, metadata: { reason: reason.slice(0, 300) } })
  await notify({ userId, type: NotificationType.SYSTEM, title: 'Two-step sign-in was reset by Doorlink support', body: 'Set it up again from your account’s security page. If you didn’t ask for this, contact support now.', href: '/account/security' })
  return { ok: true, message: 'Reset. They can sign in with their password and set it up again.' }
}

async function checkCurrentCode(session: Session, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const limited = await limitFor('mfaVerify', session.userId)
  if (!limited.ok) return { ok: false, error: tooManyMessage(limited) }
  const credential = await prisma.mfaCredential.findUnique({ where: { userId: session.userId } })
  if (!credential?.confirmedAt) return { ok: false, error: 'Two-step sign-in isn’t on.' }
  const step = verifyCode(decryptSecret(credential.secretEnc), code, credential.lastUsedStep)
  if (step === null) return { ok: false, error: 'Enter the current code from your app.' }
  await prisma.mfaCredential.update({ where: { userId: session.userId }, data: { lastUsedStep: step } })
  return { ok: true }
}
