import type { Metadata } from 'next'
import Link from 'next/link'
import { isConnected } from '@/lib/integrations'
import { ForgotForm } from './RecoveryForms'

export const metadata: Metadata = { title: 'Reset your password' }

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const expired = (await searchParams).expired === '1'
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-semibold text-graphite">Reset your password</h1>
      {expired && <p className="mt-2 rounded border border-caution/30 bg-caution-tint p-3 text-sm text-graphite">That link has expired or was already used. Ask for a new one.</p>}
      <p className="mb-6 mt-2 text-sm text-graphite-soft">We’ll email you a link to choose a new one.</p>
      {isConnected('auth') ? <ForgotForm /> : <p className="text-sm text-graphite-soft">This development site signs in without passwords, so there’s nothing to reset.</p>}
      <p className="mt-6 text-sm">
        <Link href="/sign-in" className="font-medium text-signal hover:text-signal-hover">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
