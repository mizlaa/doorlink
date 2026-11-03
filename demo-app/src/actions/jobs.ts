import { getDemo } from '../demo/store'
import { jobById, replyToReview, reviewJob, transition, companyActorName } from '../demo/flows'
import { allowedTransitions, actorFor } from '../demo/marketplace'
import type { JobStatus } from '../demo/store'

export type JobActionState = { error?: string; ok?: boolean }

export async function transitionJobAction(_prev: JobActionState, formData: FormData): Promise<JobActionState> {
  const jobId = String(formData.get('jobId') ?? '')
  const to = String(formData.get('toStatus') ?? '') as JobStatus
  const job = jobById(jobId)
  const session = getDemo().session
  if (!job || !session) return { error: 'Job not found.' }
  const actor = actorFor(job, session)
  if (!actor) return { error: 'Job not found.' }
  const paid = job.payments.some((p) => p.status === 'PAID')
  if (!allowedTransitions(actor, job.status, { paid }).includes(to)) return { error: 'That change isn’t available for this job right now.' }
  const scheduledAt = String(formData.get('scheduledAt') ?? '') || null
  if (to === 'SCHEDULED' && !scheduledAt) return { error: 'Choose a date and time.' }
  const note = String(formData.get('note') ?? '').trim() || null
  if ((to === 'CANCELLED' || to === 'DISPUTED') && !note) return { error: 'Give a short reason.' }
  transition(jobId, to, actor === 'worker' ? companyActorName(job.companyId) : session.name, { scheduledAt, note })
  return { ok: true }
}

export async function reviewJobAction(_prev: JobActionState, formData: FormData): Promise<JobActionState> {
  const jobId = String(formData.get('jobId') ?? '')
  const job = jobById(jobId)
  const session = getDemo().session
  if (!job || !session || job.customerId !== session.userId) return { error: 'Only the customer can review this job.' }
  if (job.status !== 'COMPLETED') return { error: 'You can review once the job is complete.' }
  return { ...reviewJob(jobId, formData), ok: true }
}

export async function replyToReviewAction(_prev: JobActionState, formData: FormData): Promise<JobActionState> {
  const jobId = String(formData.get('reviewId') ?? '')
  const reply = String(formData.get('reply') ?? '').trim()
  if (!reply) return { error: 'Write a reply.' }
  replyToReview(jobId, reply)
  return { ok: true }
}
