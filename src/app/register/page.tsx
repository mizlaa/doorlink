import type { Metadata } from 'next'
import Link from 'next/link'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { NotConnected } from '@/components/ui/NotConnected'
import { isConnected } from '@/lib/integrations'

export const metadata: Metadata = {
  title: 'Register',
}

export default function RegisterPage() {
  const supabaseAuth = isConnected('auth')
  const devModeAvailable = !supabaseAuth && process.env.NODE_ENV !== 'production'

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold text-graphite">Create an account</h1>
      <p className="mt-2 text-sm text-graphite-soft">
        {supabaseAuth
          ? 'Choose an account type and set a password. Demo seed accounts are not created in Supabase automatically.'
          : 'No password is set. This creates a development-only session, not real authentication.'}
      </p>

      <div className="mt-8">
        {supabaseAuth ? (
          <RegisterForm mode="supabase" />
        ) : devModeAvailable ? (
          <RegisterForm mode="dev" />
        ) : (
          <NotConnected feature="Registration" reason="No authentication provider is connected in production yet." />
        )}
      </div>

      <p className="mt-8 text-sm text-zinc-deep">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-signal hover:text-signal-hover">
          Sign in
        </Link>
      </p>
    </div>
  )
}
