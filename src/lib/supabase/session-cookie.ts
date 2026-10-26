/**
 * No session cookie means there is no user to verify. Still verify every
 * cookie-bearing request with Supabase; a cookie's contents are not trusted.
 * Supabase chunks large cookies as .0, .1, etc.
 */
export function hasSupabaseSessionCookie(
  cookies: readonly { name: string; value: string }[]
): boolean {
  return cookies.some(
    ({ name, value }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name) && value.length > 0
  )
}
