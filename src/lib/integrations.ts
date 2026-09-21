// The single place that decides whether a feature is actually live.
// Everything else checks this and renders <NotConnected /> when the
// answer is no — nothing in the UI pretends to be connected.
export type IntegrationKey = 'auth' | 'storage' | 'payments' | 'email' | 'push' | 'ai'

interface IntegrationStatus {
  enabled: boolean
  reason?: string
}

function configured(...vars: Array<string | undefined>): boolean {
  return vars.every((value) => !!value && value.length > 0)
}

function authEnabled(): boolean {
  return configured(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

function storageEnabled(): boolean {
  return configured(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_STORAGE_BUCKET
  )
}

function paymentsEnabled(): boolean {
  return configured(process.env.STRIPE_SECRET_KEY)
}

function emailEnabled(): boolean {
  return configured(process.env.RESEND_API_KEY)
}

function pushEnabled(): boolean {
  return configured(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
}

function aiEnabled(): boolean {
  return configured(process.env.ANTHROPIC_API_KEY)
}

/** Snapshot for UI copy; prefer `isConnected()` at decision time. */
export const integrations: Record<IntegrationKey, IntegrationStatus> = {
  auth: authEnabled()
    ? { enabled: true }
    : {
        enabled: false,
        reason: 'Supabase auth is not configured. The dev session provider is active instead.',
      },
  storage: storageEnabled()
    ? { enabled: true }
    : { enabled: false, reason: 'Supabase storage is not configured. Document uploads are disabled.' },
  payments: paymentsEnabled()
    ? { enabled: true }
    : { enabled: false, reason: 'Stripe is not configured. Checkout stays in demo mode.' },
  email: emailEnabled()
    ? { enabled: true }
    : { enabled: false, reason: 'Resend is not configured. No transactional email is sent.' },
  push: pushEnabled()
    ? { enabled: true }
    : { enabled: false, reason: 'No VAPID keys are configured. No push notification is sent.' },
  ai: aiEnabled()
    ? { enabled: true }
    : { enabled: false, reason: 'No AI provider is configured.' },
}

export function isConnected(key: IntegrationKey): boolean {
  switch (key) {
    case 'auth':
      return authEnabled()
    case 'storage':
      return storageEnabled()
    case 'payments':
      return paymentsEnabled()
    case 'email':
      return emailEnabled()
    case 'push':
      return pushEnabled()
    case 'ai':
      return aiEnabled()
  }
}

export const isDemoMode = process.env.DOORLINK_DEMO_MODE !== 'false'
