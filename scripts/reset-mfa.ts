/**
 * Break-glass: clears two-step sign-in for one account, for when the only
 * admin has lost their phone and their recovery codes. Needs direct
 * database access (DATABASE_URL), so it is for whoever runs the hosting,
 * not something reachable from the web. Recorded in the audit log.
 *
 *   npm run mfa:reset -- person@example.com "Confirmed by phone call with ..."
 */
import { PrismaClient } from '@prisma/client'

async function main() {
  const [email, ...why] = process.argv.slice(2)
  const reason = why.join(' ').trim()
  if (!email || reason.length < 10) {
    console.error('Usage: npm run mfa:reset -- <email> "<how you confirmed it is them>"')
    process.exit(1)
  }
  const prisma = new PrismaClient()
  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } })
    if (!user) throw new Error(`No account for ${email}`)
    const [, removed] = await prisma.$transaction([
      prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.mfaCredential.deleteMany({ where: { userId: user.id } }),
    ])
    await prisma.auditLog.create({ data: { actorId: null, action: 'cli.mfa.reset', entityType: 'User', entityId: user.id, metadata: { reason: reason.slice(0, 300), host: process.env.HOSTNAME ?? null } } })
    console.log(removed.count ? `Two-step sign-in cleared for ${email}. They can sign in and set it up again.` : `${email} did not have two-step sign-in.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
