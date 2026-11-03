import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { SignInForm } from '@/components/auth/SignInForm'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { safeNextPath } from '@/lib/safe-next'
import { DEMO_ACCOUNTS } from '../demo/data'
import { signInAs } from '../demo/store'
import { navigate } from '../router'

const ROLE_LABEL: Record<string, string> = {
  customer: 'Customer',
  installer: 'Installer',
  supplier: 'Supplier',
  manufacturer: 'Manufacturer',
  admin: 'Admin',
}

const LANDING: Record<string, string> = {
  customer: '/',
  installer: '/leads',
  supplier: '/dashboard',
  manufacturer: '/dashboard',
  admin: '/admin',
}

// src/app/sign-in/page.tsx in its email-and-password form, plus the demo
// accounts, shown openly so anyone trying the demo can sign in.
export function SignInPage() {
  const params = useSearchParams()
  const next = safeNextPath(params.get('next') ?? '', '')

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold text-graphite">Sign in</h1>
      <p className="mt-2 text-sm text-graphite-soft">Sign in with the email and password for your Doorlink account.</p>

      <div className="mt-8">
        <SignInForm mode="supabase" next={next || undefined} />
      </div>

      <p className="mt-8 text-sm text-zinc-deep">
        No account?{' '}
        <Link href="/register" className="font-medium text-signal hover:text-signal-hover">
          Register
        </Link>
      </p>

      <Panel className="mt-10">
        <PanelBody className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-graphite">Demo accounts</h2>
            <p className="mt-1 text-sm text-zinc-deep">
              Every account uses the password <span className="font-code text-graphite">{DEMO_ACCOUNTS[0].password}</span>.
              They exist only in this demo.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-graphite">{ROLE_LABEL[account.role]}</span>
                  <span className="block truncate font-code text-xs text-zinc-deep">{account.email}</span>
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    signInAs(account)
                    navigate(next || LANDING[account.role])
                  }}
                >
                  Try it
                </Button>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>
    </div>
  )
}
