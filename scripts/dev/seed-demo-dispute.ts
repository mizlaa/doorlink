// Dev-only: puts one job into dispute and files one report, so the admin
// moderation screens can be walked with something real in them.
import { DisputeStatus, JobStatus, PrismaClient, ReportStatus, ReportTargetType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Written with plain Prisma rather than through acceptQuote(), because
  // the marketplace module reaches server-only code that does not resolve
  // outside Next. This is a fixture, not a test of the hire path.
  let job = await prisma.job.findFirst({ orderBy: { createdAt: 'desc' } })

  if (!job) {
    const lead = await prisma.lead.findFirst({ orderBy: { createdAt: 'desc' } })
    const worker = await prisma.user.findUnique({ where: { email: 'technician@demo.doorlink' } })
    if (!lead?.customerId || !worker) {
      throw new Error('seed a lead first: npx tsx scripts/dev/seed-demo-lead.ts')
    }

    const quote = await prisma.quote.create({
      data: {
        leadId: lead.id,
        workerId: worker.id,
        amountCents: 48000,
        message: 'Replace both safety beams and reset the close limit.',
        status: 'ACCEPTED',
      },
    })

    job = await prisma.job.create({
      data: {
        reference: `DL-JOB-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
        leadId: lead.id,
        quoteId: quote.id,
        customerId: lead.customerId,
        workerId: worker.id,
        description: lead.message,
        status: JobStatus.DISPUTED,
        agreedPriceCents: quote.amountCents,
      },
    })
  } else {
    await prisma.job.update({ where: { id: job.id }, data: { status: JobStatus.DISPUTED } })
  }

  const dispute = await prisma.dispute.create({
    data: {
      jobId: job.id,
      raisedById: job.customerId!,
      reason: 'Door still reverses on closing',
      detail:
        'The beams were replaced but it still reverses about halfway down. I have asked twice about coming back.',
      status: DisputeStatus.OPEN,
    },
  })

  const report = await prisma.report.create({
    data: {
      reporterId: job.customerId!,
      targetType: ReportTargetType.LISTING,
      targetId: 'demo-listing-id',
      reason: 'Listing looks like a duplicate',
      detail: 'Same photo and price as another listing further down the page.',
      status: ReportStatus.OPEN,
    },
  })

  console.log('dispute', dispute.id, 'on job', job.reference)
  console.log('report', report.id)
}

main().finally(() => prisma.$disconnect())
