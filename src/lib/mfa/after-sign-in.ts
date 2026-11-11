import { prisma } from '@/lib/prisma'

/** Where a successful password (or dev) sign-in goes: the code screen first when the account has two-step sign-in on. */
export async function afterSignInPath(email: string, next: string): Promise<string> {
  const credential = await prisma.mfaCredential.findFirst({ where: { user: { email }, confirmedAt: { not: null } }, select: { id: true } })
  return credential ? `/account/mfa?next=${encodeURIComponent(next)}` : next
}
