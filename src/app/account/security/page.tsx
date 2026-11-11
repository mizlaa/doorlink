import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Role } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { startMfaSetupAction } from '@/lib/mfa/actions'
import { adminMfaRequired } from '@/lib/mfa/policy'
import { decryptSecret, otpauthUri } from '@/lib/mfa/totp'
import { prisma } from '@/lib/prisma'
import { SecurityPanel } from './SecurityForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sign-in security', robots: { index: false } }

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ setup?: string; required?: string; low?: string }> }) {
  const session = await getSession()
  if (!session) redirect('/sign-in?next=/account/security')
  const params = await searchParams
  const [credential, unused] = await Promise.all([
    prisma.mfaCredential.findUnique({ where: { userId: session.userId } }),
    prisma.mfaRecoveryCode.count({ where: { userId: session.userId, usedAt: null } }),
  ])
  const on = !!credential?.confirmedAt
  const settingUp = !!credential && !on && params.setup === '1'
  const secret = settingUp ? decryptSecret(credential!.secretEnc) : null
  const mustHave = session.role === Role.ADMIN && adminMfaRequired()

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-graphite">Two-step sign-in</h1>
      <p className="mt-2 text-sm text-graphite-soft">
        After your password, you enter a code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password and others). Recommended for business owners; required for Doorlink admins.
      </p>
      {params.required === '1' && !on && <p className="mt-4 rounded border border-caution/30 bg-caution-tint p-3 text-sm text-graphite">Admin accounts need two-step sign-in before they can open the admin area.</p>}
      {params.low === '1' && <p className="mt-4 rounded border border-caution/30 bg-caution-tint p-3 text-sm text-graphite">You have {unused} recovery code{unused === 1 ? '' : 's'} left. Make new ones below.</p>}

      <div className="mt-6 rounded-lg border border-line bg-rail p-5">
        <SecurityPanel
          mode={on ? 'on' : secret ? 'setup' : 'off'}
          secretDisplay={secret ? (secret.match(/.{1,4}/g) ?? []).join(' ') : null}
          otpauth={secret ? otpauthUri(secret, session.email) : null}
          unused={unused}
          mustHave={mustHave}
          startSetup={startMfaSetupAction}
        />
      </div>
      <p className="mt-6 text-sm text-graphite-soft">
        Lost your phone and your recovery codes? Contact Doorlink support. After checking it’s you, an admin can reset two-step sign-in so you can set it up again.
      </p>
    </div>
  )
}
