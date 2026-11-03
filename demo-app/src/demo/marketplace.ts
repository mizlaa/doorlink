import type { DemoSession, Job, JobStatus } from './store'

// The job state machine from src/lib/marketplace.ts (that module also
// talks to the database, so its rules are repeated here unchanged).
export type JobActor = 'customer' | 'worker' | 'admin'

const TRANSITIONS: Record<JobActor, Partial<Record<JobStatus, JobStatus[]>>> = {
  worker: {
    ACCEPTED: ['SCHEDULED', 'CANCELLED'],
    PAYMENT_CONFIRMED: ['SCHEDULED', 'CANCELLED'],
    SCHEDULED: ['IN_PROGRESS', 'SCHEDULED', 'CANCELLED'],
    IN_PROGRESS: ['BUSINESS_COMPLETED'],
  },
  customer: {
    REQUESTED: ['CANCELLED'],
    AWAITING_PAYMENT: ['CANCELLED'],
    ACCEPTED: ['CANCELLED', 'DISPUTED'],
    PAYMENT_CONFIRMED: ['CANCELLED', 'DISPUTED'],
    SCHEDULED: ['CANCELLED', 'DISPUTED'],
    IN_PROGRESS: ['DISPUTED'],
    BUSINESS_COMPLETED: ['COMPLETED', 'DISPUTED'],
    COMPLETED: ['DISPUTED'],
  },
  admin: {
    REQUESTED: ['CANCELLED'],
    AWAITING_PAYMENT: ['CANCELLED'],
    ACCEPTED: ['SCHEDULED', 'CANCELLED', 'DISPUTED'],
    PAYMENT_CONFIRMED: ['SCHEDULED', 'CANCELLED', 'DISPUTED'],
    SCHEDULED: ['IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
    IN_PROGRESS: ['BUSINESS_COMPLETED', 'CANCELLED', 'DISPUTED'],
    BUSINESS_COMPLETED: ['COMPLETED', 'DISPUTED'],
    COMPLETED: ['DISPUTED'],
    DISPUTED: ['COMPLETED', 'CANCELLED'],
  },
}

export function allowedTransitions(actor: JobActor, from: JobStatus, context: { paid?: boolean } = {}): JobStatus[] {
  const moves = TRANSITIONS[actor][from] ?? []
  if (context.paid && actor === 'customer') return moves.filter((to) => to !== 'CANCELLED')
  return moves
}

export function actorFor(job: Job, session: DemoSession): JobActor | null {
  if (job.customerId === session.userId) return 'customer'
  if (session.companyId && session.companyId === job.companyId) return 'worker'
  if (session.role === 'ADMIN') return 'admin'
  return null
}

export function isReviewable(status: JobStatus): boolean {
  return status === 'COMPLETED'
}
