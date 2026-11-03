import { z } from 'zod'
import type { RegisterState, SignInState } from '@/lib/auth-state'
import { navigate } from '../router'
import { getDemo, signInAs, signOut, update, userIdFor } from '../demo/store'
import type { DemoAccount } from '../demo/data'

// Demo stand-ins for lib/auth-session. Accounts live in this browser only;
// the published demo passwords are the only ones that work.

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

function landingFor(account: DemoAccount): string {
  switch (account.role) {
    case 'installer':
      return '/leads'
    case 'supplier':
    case 'manufacturer':
      return '/dashboard'
    case 'admin':
      return '/admin'
    default:
      return '/'
  }
}

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({ email: formData.get('email'), password: formData.get('password') ?? '' })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  const account = getDemo().accounts.find((a) => a.email === parsed.data.email)
  if (!account || (account.password !== '' && account.password !== parsed.data.password)) {
    return { error: 'That email and password don’t match a demo account. Use one of the demo accounts below.' }
  }
  signInAs(account)
  const next = String(formData.get('next') ?? '')
  navigate(next.startsWith('/') ? next : landingFor(account))
  return {}
}

const ROLE_MAP: Record<string, DemoAccount['role']> = {
  CUSTOMER: 'customer',
  TECHNICIAN: 'installer',
  SUPPLIER: 'supplier',
  MANUFACTURER: 'manufacturer',
}

export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const role = ROLE_MAP[String(formData.get('role') ?? 'CUSTOMER')] ?? 'customer'
  if (!name) return { error: 'Enter your name.' }
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid email address.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (role !== 'customer' && !String(formData.get('businessName') ?? '').trim()) {
    return { error: 'Enter your business name.' }
  }
  if (getDemo().accounts.some((a) => a.email === email)) return { error: 'An account with that email already exists.' }
  const appRole = ({ customer: 'CUSTOMER', installer: 'TECHNICIAN', supplier: 'SUPPLIER', manufacturer: 'MANUFACTURER' } as const)[
    role as 'customer'
  ]
  // The password is checked for length and then dropped: a visitor may
  // type a real one, and the demo never keeps it. Accounts made here sign
  // back in with any password.
  const account: DemoAccount = {
    role,
    email,
    password: '',
    name,
    appRole,
    companyId: role === 'customer' ? undefined : role === 'installer' ? 'company_01' : role === 'supplier' ? 'company_03' : 'company_08',
  }
  update((s) => {
    s.accounts.push(account)
  })
  signInAs(account)
  update((s) => {
    s.notifications.unshift({
      id: `n-${Date.now()}`,
      userId: userIdFor(account),
      title: 'Demo account created',
      body: 'This account exists only in this browser. Nothing was sent anywhere.',
      href: '/account',
      at: new Date().toISOString(),
      read: false,
    })
  })
  navigate('/welcome')
  return {}
}

export async function signOutAction(_formData?: FormData): Promise<void> {
  signOut()
  navigate('/')
}
