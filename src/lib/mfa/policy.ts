/** Admin accounts must use two-step sign-in in production (or locally with MFA_REQUIRE_ADMIN=1). */
export function adminMfaRequired(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.MFA_REQUIRE_ADMIN === '1'
}
