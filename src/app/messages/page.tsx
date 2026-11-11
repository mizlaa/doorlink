import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { listConversations } from '@/lib/messaging'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'

export const metadata: Metadata = { title: 'Messages' }

export default async function MessagesPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  let conversations
  try {
    conversations = await listConversations(session.userId)
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Messages" reason="Can't reach the database right now." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Messages</h1>
        <p className="mt-1 text-graphite-soft">
          Questions about a quote, and everything about a job you&apos;ve agreed.
        </p>
      </header>

      {conversations.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description="Threads start from a quote or a job. There is no way to message someone out of the blue."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/messages/${conversation.id}`}
                className="block rounded-md border border-line bg-paper p-4 transition-colors hover:border-signal"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-medium text-graphite">
                    {conversation.otherName}
                    {conversation.unread > 0 && (
                      <span className="ml-2 rounded-full bg-signal px-2 py-0.5 text-micro font-medium text-paper">
                        {conversation.unread} new
                      </span>
                    )}
                  </p>
                  {conversation.lastMessageAt && (
                    <span className="text-micro text-zinc-deep">
                      {conversation.lastMessageAt.toLocaleDateString('en-AU', {
                        timeZone: 'Australia/Sydney',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-micro text-zinc-deep">
                  {conversation.subject ?? 'Doorlink'}
                  {conversation.job && ` · job ${conversation.job.reference}`}
                  {!conversation.job && conversation.lead && ` · quote on ${conversation.lead.reference}`}
                </p>

                {conversation.latest && (
                  <p className="mt-2 line-clamp-2 text-sm text-graphite-soft">
                    {conversation.latest.senderId === session.userId && (
                      <span className="text-zinc-deep">You: </span>
                    )}
                    {conversation.latest.body}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
