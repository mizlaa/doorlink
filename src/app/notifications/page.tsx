import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { deliveryChannels } from '@/lib/notifications'
import { NotConnected } from '@/components/ui/NotConnected'
import { EmptyState } from '@/components/ui/EmptyState'
import { MarkAllRead } from './MarkAllRead'

export const metadata: Metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  let notifications
  try {
    notifications = await prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Notifications" reason="Can't reach the database right now." />
      </div>
    )
  }

  const unread = notifications.filter((n) => n.readAt === null).length
  const channels = deliveryChannels()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">Notifications</h1>
          <p className="mt-1 text-graphite-soft">
            {unread > 0 ? `${unread} unread.` : 'Everything here has been read.'}
          </p>
        </div>
        {unread > 0 && <MarkAllRead />}
      </header>

      {/* Says which channels a notification actually reaches. Two of the
          three are in the brief and neither is connected, and a settings
          screen with toggles for them would imply they work. */}
      {(!channels.email || !channels.push) && (
        <p className="mb-8 rounded-md border border-caution/30 bg-caution-tint p-4 text-sm text-graphite">
          Notifications appear here and nowhere else right now.{' '}
          {!channels.email && 'No email provider is connected, so none of these were emailed to you. '}
          {!channels.push && 'Push notifications are not set up, so your phone will not buzz.'}
        </p>
      )}

      {notifications.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          description="Quotes, job updates, messages and reviews all land here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => {
            const isUnread = notification.readAt === null
            const body = (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className={isUnread ? 'font-medium text-graphite' : 'text-graphite'}>
                    {isUnread && (
                      <span
                        aria-hidden="true"
                        className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle"
                      />
                    )}
                    {notification.title}
                    {isUnread && <span className="sr-only"> (unread)</span>}
                  </p>
                  <span className="text-micro text-zinc-deep">
                    {notification.createdAt.toLocaleString('en-AU', {
                      timeZone: 'Australia/Sydney',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <p className="mt-1 text-sm text-graphite-soft">{notification.body}</p>
              </>
            )

            return (
              <li key={notification.id}>
                {notification.href ? (
                  <Link
                    href={notification.href}
                    className={`block rounded-md border p-4 transition-colors hover:border-signal ${
                      isUnread ? 'border-signal/40 bg-signal-tint' : 'border-line bg-paper'
                    }`}
                  >
                    {body}
                  </Link>
                ) : (
                  <div
                    className={`rounded-md border p-4 ${
                      isUnread ? 'border-signal/40 bg-signal-tint' : 'border-line bg-paper'
                    }`}
                  >
                    {body}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
