import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { withSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const safeNext = (value: string | null) => (value && value.startsWith('/') && !value.startsWith('//') ? value : '/')

/**
 * Where Supabase's emailed links land (password reset, email confirmation).
 * Swaps the one-time token for a session, then continues to `next`.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const next = safeNext(url.searchParams.get('next'))
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  try {
    const { error } = code
      ? await withSupabaseServerClient((supabase) => supabase.auth.exchangeCodeForSession(code))
      : tokenHash && type
        ? await withSupabaseServerClient((supabase) => supabase.auth.verifyOtp({ token_hash: tokenHash, type }))
        : { error: new Error('missing token') }
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
  } catch (error) {
    console.error('Auth link could not be confirmed', error)
  }
  return NextResponse.redirect(new URL('/forgot-password?expired=1', url.origin))
}
