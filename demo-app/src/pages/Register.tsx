import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { RegisterForm } from '@/components/auth/RegisterForm'

// src/app/register/page.tsx in its email-and-password form.
export function RegisterPage() {
  const params = useSearchParams()
  const initialRole = params.get('as') === 'business' ? 'TECHNICIAN' : 'CUSTOMER'
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <h1 className="text-2xl font-semibold text-graphite">Create an account</h1>
      <p className="mt-2 text-sm text-graphite-soft">Customers get quotes and hire. Businesses get found and quote.</p>
      <p className="mt-2 text-xs text-caution">Demo: the account is kept in this browser only, without its password. Nothing is sent anywhere.</p>

      <div className="mt-8">
        <RegisterForm mode="supabase" initialRole={initialRole} />
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
