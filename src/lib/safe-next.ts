/**
 * Where to send someone after signing in. Only a path on this site is
 * accepted — "/quote?spec=…" yes, "//evil.example" or "https://…" no — so
 * a crafted sign-in link cannot bounce a customer to another site.
 */
export function safeNextPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback
  const next = value.trim()
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f]/.test(next)) return fallback
  return next.length > 2000 ? fallback : next
}
