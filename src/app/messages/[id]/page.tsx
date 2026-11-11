import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { isThreadOpen, markConversationRead } from '@/lib/messaging'
import { NotConnected } from '@/components/ui/NotConnected'
import { Badge } from '@/components/ui/Badge'
import { JOB_STATUS_LABELS, JOB_STATUS_TONE } from '@/lib/labels'
import { MessageForm } from './MessageForm'

export const metadata: Metadata = { title: 'Conversation' }

type PageProps = { params: Promise<{ id: string }> }

export default async function ConversationPage({ params }: PageProps) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/sign-in')

  let conversation
  try {
    conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        job: { select: { id: true, reference: true, status: true } },
        lead: { select: { id: true, reference: true, title: true, customerId: true } },
        participants: {
          select: {
            userId: true,
            user: {
              select: { id: true, name: true, technicianProfile: { select: { businessName: true } } },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: { id: true, name: true, technicianProfile: { select: { businessName: true } } },
            },
          },
        },
      },
    })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="This conversation" reason="Can't reach the database right now." />
      </div>
    )
  }

  // Someone else's thread is indistinguishable from one that isn't there.
  if (!conversation) notFound()
  if (!conversation.participants.some((p) => p.userId === session.userId)) notFound()

  await markConversationRead(conversation.id, session.userId)

  const other = conversation.participants.find((p) => p.userId !== session.userId)?.user
  const otherName = other?.technicianProfile?.businessName || other?.name || 'Doorlink user'
  const open = isThreadOpen(conversation.job)

  // Where this thread came from, so a person can get back to the job or
  // the request it is about.
  const context = conversation.job
    ? { href: `/jobs/${conversation.job.id}`, label: `Job ${conversation.job.reference}` }
    : conversation.lead
      ? {
          href:
            conversation.lead.customerId === session.userId ? `/my-requests/${conversation.lead.id}` : '/leads',
          label: `Request ${conversation.lead.reference}`,
        }
      : null

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <nav className="mb-6 text-sm">
        <Link href="/messages" className="font-medium text-signal hover:text-signal-hover">
          Messages
        </Link>
      </nav>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">{otherName}</h1>
          <p className="mt-1 text-sm text-zinc-deep">
            {conversation.subject}
            {context && (
              <>
                {' · '}
                <Link href={context.href} className="font-medium text-signal hover:text-signal-hover">
                  {context.label}
                </Link>
              </>
            )}
          </p>
        </div>
        {conversation.job && (
          <Badge tone={JOB_STATUS_TONE[conversation.job.status]}>
            {JOB_STATUS_LABELS[conversation.job.status]}
          </Badge>
        )}
      </header>

      <ol className="flex flex-col gap-4">
        {conversation.messages.map((message) => {
          const mine = message.senderId === session.userId
          const name = message.sender.technicianProfile?.businessName || message.sender.name
          return (
            <li key={message.id} className={mine ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
              <div
                className={
                  mine
                    ? 'max-w-[85%] rounded-lg rounded-br-sm bg-signal px-4 py-3 text-paper'
                    : 'max-w-[85%] rounded-lg rounded-bl-sm border border-line bg-paper px-4 py-3 text-graphite'
                }
              >
                <p className="whitespace-pre-wrap text-sm">{message.body}</p>
              </div>
              <p className="mt-1 px-1 text-micro text-zinc-deep">
                {mine ? 'You' : name} ·{' '}
                {message.createdAt.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </li>
          )
        })}
      </ol>

      <div className="mt-8 border-t border-line pt-6">
        {open ? (
          <MessageForm conversationId={conversation.id} />
        ) : (
          <p className="text-sm text-zinc-deep">
            This job was cancelled, so the thread is closed. The history stays here for both of you.
          </p>
        )}
      </div>
    </div>
  )
}
