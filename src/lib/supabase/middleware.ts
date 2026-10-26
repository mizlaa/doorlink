import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasSupabaseSessionCookie } from './session-cookie'
import { AuthServiceUnavailableError, runAuthOperation } from './auth-service'

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey || !hasSupabaseSessionCookie(request.cookies.getAll())) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    await runAuthOperation(async (context) => {
      const supabase = createServerClient(url, anonKey, {
        global: { fetch: context.fetch },
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            if (!context.canWriteCookies()) return
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      })

      // Only refresh cookies here. Authorization is still verified with
      // getUser() in the server session provider; never trust getSession().user.
      await supabase.auth.getSession()
    })
  } catch (error) {
    if (!(error instanceof AuthServiceUnavailableError)) throw error
    // Public navigation must continue during an auth outage. Protected pages
    // still require the server's verified session. Preserve existing cookies.
    return NextResponse.next({ request })
  }

  return supabaseResponse
}
