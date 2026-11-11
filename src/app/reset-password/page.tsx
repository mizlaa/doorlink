import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { NewPasswordForm } from '../forgot-password/RecoveryForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } }

export default async function ResetPasswordPage() {
  const session = await getSession()
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-semibold text-graphite">Choose a new password</h1>
      {session ? (
        <div className="mt-6">
          <NewPasswordForm />
        </div>
      ) : (
        <p className="mt-3 text-sm text-graphite-soft">
          Open the link from your email to get here, or{' '}
          <Link href="/forgot-password" className="font-medium text-signal hover:text-signal-hover">
            ask for a new one
          </Link>
          .
        </p>
      )}
    </div>
  )
}
