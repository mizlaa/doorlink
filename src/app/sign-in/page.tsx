import type { Metadata } from 'next'
import Link from 'next/link'
import { SignInForm } from '@/components/auth/SignInForm'
import { NotConnected } from '@/components/ui/NotConnected'
import { isConnected } from '@/lib/integrations'

export const metadata: Metadata = {
  title: 'Sign in',
}

export default function SignInPage() {
  const supabaseAuth = isConnected('auth')
  const devModeAvailable = !supabaseAuth && process.env.NODE_ENV !== 'production'

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold text-graphite">Sign in</h1>
      <p className="mt-2 text-sm text-graphite-soft">
        {supabaseAuth
          ? 'Sign in with the email and password for your Doorlink account.'
          : 'Doorlink uses a development-only session here — no password — until Supabase auth is configured.'}
      </p>

      <div className="mt-8">
        {supabaseAuth ? (
          <SignInForm mode="supabase" />
        ) : devModeAvailable ? (
          <SignInForm mode="dev" />
        ) : (
          <NotConnected feature="Sign-in" reason="No authentication provider is connected in production yet." />
        )}
      </div>

      <p className="mt-8 text-sm text-zinc-deep">
        No account?{' '}
        <Link href="/register" className="font-medium text-signal hover:text-signal-hover">
          Register
        </Link>
      </p>
    </div>
  )
}
