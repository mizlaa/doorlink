import type { Metadata } from 'next'
import Link from 'next/link'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { NotConnected } from '@/components/ui/NotConnected'
import { isConnected } from '@/lib/integrations'

export const metadata: Metadata = {
  title: 'Register',
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  // /register?as=business opens on the installer option.
  const { as } = await searchParams
  const initialRole = as === 'business' ? 'TECHNICIAN' : 'CUSTOMER'
  const supabaseAuth = isConnected('auth')
  const devModeAvailable = !supabaseAuth && process.env.NODE_ENV !== 'production'

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <h1 className="text-2xl font-semibold text-graphite">Create an account</h1>
      <p className="mt-2 text-sm text-graphite-soft">
        {supabaseAuth
          ? 'Customers get quotes and hire. Businesses get found and quote.'
          : 'Development mode: no password is set, and this is not real authentication.'}
      </p>

      <div className="mt-8">
        {supabaseAuth ? (
          <RegisterForm mode="supabase" initialRole={initialRole} />
        ) : devModeAvailable ? (
          <RegisterForm mode="dev" initialRole={initialRole} />
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
