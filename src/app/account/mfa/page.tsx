import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getPendingMfaSession } from '@/lib/auth'
import { VerifyForm } from '../security/SecurityForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Enter your code', robots: { index: false } }

const safeNext = (value: string | undefined) => (value && value.startsWith('/') && !value.startsWith('//') ? value : '/')

/** The second step at sign-in. */
export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  const pending = await getPendingMfaSession()
  if (!pending) redirect(next)
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-semibold text-graphite">Enter your code</h1>
      <p className="mb-6 mt-2 text-sm text-graphite-soft">Open your authenticator app and enter the 6-digit code for Doorlink ({pending.email}).</p>
      <VerifyForm next={next} />
      <p className="mt-6 text-sm text-graphite-soft">Lost your phone? Use one of your recovery codes instead.</p>
    </div>
  )
}
