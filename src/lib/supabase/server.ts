import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { runAuthOperation } from './auth-service'

function supabaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return url && url.length > 0 ? url : null
}

function supabaseAnonKey(): string | null {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return key && key.length > 0 ? key : null
}

export function isSupabaseAuthConfigured(): boolean {
  return !!(supabaseUrl() && supabaseAnonKey())
}

async function createSupabaseServerClient(context: {
  fetch: typeof fetch
  canWriteCookies: () => boolean
}) {
  const url = supabaseUrl()
  const anonKey = supabaseAnonKey()
  if (!url || !anonKey) {
    throw new Error('Supabase auth is not configured.')
  }

  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    global: { fetch: context.fetch },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        if (!context.canWriteCookies()) return
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // setAll from a Server Component — middleware will refresh the session.
        }
      },
    },
  })
}

export async function withSupabaseServerClient<T>(
  run: (client: Awaited<ReturnType<typeof createSupabaseServerClient>>) => Promise<T>
): Promise<T> {
  return runAuthOperation(async (context) => run(await createSupabaseServerClient(context)))
}
