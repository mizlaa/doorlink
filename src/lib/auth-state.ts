// Form state for sign-in and registration. Kept out of the 'use server'
// modules: those may only export server actions, and Turbopack treats any
// other export from them (even a type re-export) as a missing action.
export type SignInState = { error?: string }
export type RegisterState = { error?: string }
