/** Free credits granted once when a signed-in user first opens the configurator. */
export const WELCOME_CREDITS = 2

/** Credits spent per successful garage-door image generation. */
export const PREVIEW_CREDIT_COST = 1

/**
 * Planned OpenAI cost for one high-quality 1024×1024 preview, including a
 * typical photo input. Pack sizes are derived from this.
 */
export const PREVIEW_API_COST_USD = 0.18

/** USD to AUD rate used to turn that API cost into pack credit counts. Frankfurter, 2026-09-25. */
export const PREVIEW_USD_TO_AUD = 1.4224

/** How many previews an AUD price covers at the planned API cost, rounded down. */
export function previewCreditsForPriceCents(priceCents: number): number {
  const costCentsAud = PREVIEW_API_COST_USD * PREVIEW_USD_TO_AUD * 100
  return Math.floor(priceCents / costCentsAud)
}

/** After this, an in-flight generation lock is treated as stale and refunded once. */
export const IN_FLIGHT_STALE_MS = 2 * 60 * 1000
