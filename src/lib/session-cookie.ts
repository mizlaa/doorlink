// Shared between auth.ts (reads it) and dev-session.ts (writes it via
// Server Actions). Kept out of "use server" files, whose exports must all
// be async functions.
export const DEV_SESSION_COOKIE = 'doorlink-dev-session'

// Set once the second step (authenticator code or recovery code) is done.
export const MFA_COOKIE = 'doorlink-mfa'
