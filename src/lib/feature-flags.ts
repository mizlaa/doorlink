/**
 * Switches for the 3D experience. Read at build time, so a flag change
 * needs a rebuild. Off by default: the live app renders exactly as before.
 */
export const FEATURE_3D_V2 = process.env.NEXT_PUBLIC_FEATURE_3D_V2 === '1'
