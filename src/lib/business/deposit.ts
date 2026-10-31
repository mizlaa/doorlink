/** How much of the agreed price a business takes when a job is confirmed. 100 = paid in full. */
export const DEPOSIT_CHOICES = [100, 50, 30, 20, 10] as const

/** The deposit on an amount, in whole cents; the balance is the remainder so the two always add up. */
export function splitDeposit(totalCents: number, depositPercent: number): { depositCents: number; balanceCents: number } {
  if (depositPercent >= 100) return { depositCents: totalCents, balanceCents: 0 }
  const depositCents = Math.round((totalCents * depositPercent) / 100)
  return { depositCents, balanceCents: totalCents - depositCents }
}
