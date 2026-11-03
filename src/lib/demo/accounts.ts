/**
 * The three one-click demo accounts on /sign-in (demo mode only). These
 * emails exist only in the demo database; see lib/demo/seed.ts.
 */
export const DEMO_ACCOUNTS = {
  customer: 'customer@demo.doorlink',
  owner: 'owner@demo.doorlink',
  admin: 'admin@demo.doorlink',
} as const

export const DEMO_SIGN_IN_ACCOUNTS = [
  { email: DEMO_ACCOUNTS.customer, label: 'Customer' },
  { email: DEMO_ACCOUNTS.owner, label: 'Business owner' },
  { email: DEMO_ACCOUNTS.admin, label: 'Super admin' },
]
