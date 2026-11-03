import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { can } from '@/lib/rbac'
import { describeSpec } from '@/lib/configurator/options'
import { formatMoney } from '@/lib/money'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { Table, Td, Th } from '@/components/ui/Table'
import { navigate, useLocation } from '../router'
import { makeId, resetDemo, signInAs, signOut, update, useDemo } from '../demo/store'
import { companyById, DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoAccount } from '../demo/data'
import { conversationsFor } from '../demo/messages'
import { DemoTag, InlineConfirm, SignInPrompt } from './shared'
import { NotFoundPage } from './NotFound'

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Customer',
  TECHNICIAN: 'Installer',
  SUPPLIER: 'Supplier',
  MANUFACTURER: 'Manufacturer',
  ADMIN: 'Admin',
}

const HOME_FOR: Record<DemoAccount['role'], string> = {
  customer: '/',
  installer: '/leads',
  supplier: '/dashboard',
  manufacturer: '/dashboard',
  admin: '/admin',
}

/** One-click role switcher, used on Account and the guided tour. */
export function RoleSwitcher({ current }: { current?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {DEMO_ACCOUNTS.map((account) => (
        <Button
          key={account.email}
          type="button"
          size="sm"
          variant={account.email === current ? 'primary' : 'secondary'}
          onClick={() => {
            signInAs(account)
            navigate(HOME_FOR[account.role])
          }}
        >
          {account.email === current ? `✓ ${ROLE_LABEL[account.appRole]}` : `Try as ${ROLE_LABEL[account.appRole]}`}
        </Button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Account (src/app/account/page.tsx)                                  */
/* ------------------------------------------------------------------ */

export function AccountPage() {
  const session = useDemo((s) => s.session)
  const listings = useDemo((s) => s.listings)
  const tickets = useDemo((s) => s.tickets)
  const leads = useDemo((s) => s.leads)
  const profile = useDemo((s) => s.complianceProfile)
  const [saved, setSaved] = useState(false)
  if (!session) return <SignInPrompt next="/account" title="Sign in to see your account" />
  const company = session.companyId ? companyById(session.companyId) : undefined
  const mine = listings.filter((l) => (l.ownerUserId ? l.ownerUserId === session.userId : Boolean(session.companyId) && l.sellerCompanyId === session.companyId))
  const openTickets = tickets.filter((t) => t.userId === session.userId && t.status !== 'RESOLVED').length
  const handlesLeads = can(session.role, 'marketplace:quote') && Boolean(session.companyId)
  const quoted = leads.filter((l) => l.responses.some((r) => r.companyId === session.companyId)).length

  return (
    <div className="mx-auto flex max-w-shell flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-xl font-semibold text-graphite">{session.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="signal">{ROLE_LABEL[session.role] ?? session.role}</Badge>
          {company && <Badge tone="neutral">{company.name}</Badge>}
          <DemoTag>Demo account</DemoTag>
        </div>
        <p className="mt-2 text-sm text-zinc-deep">{session.email}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/my-listings" className="flex flex-col gap-1 rounded-md border border-line p-5 transition-colors hover:border-signal">
          <p className="text-sm text-zinc-deep">Your listings</p>
          <p className="text-2xl font-semibold text-graphite">{mine.length}</p>
          <p className="text-micro text-zinc-deep">{mine.filter((l) => l.status === 'ACTIVE').length} active</p>
        </Link>
        <Link href="/support" className="flex flex-col gap-1 rounded-md border border-line p-5 transition-colors hover:border-signal">
          <p className="text-sm text-zinc-deep">Open support tickets</p>
          <p className="text-2xl font-semibold text-graphite">{openTickets}</p>
        </Link>
        {handlesLeads ? (
          <Link href="/leads" className="flex flex-col gap-1 rounded-md border border-line p-5 transition-colors hover:border-signal">
            <p className="text-sm text-zinc-deep">Requests you&rsquo;ve quoted on</p>
            <p className="text-2xl font-semibold text-graphite">{quoted}</p>
          </Link>
        ) : (
          <Link href="/jobs" className="flex flex-col gap-1 rounded-md border border-line p-5 transition-colors hover:border-signal">
            <p className="text-sm text-zinc-deep">Jobs</p>
            <p className="text-2xl font-semibold text-graphite">→</p>
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Contact details</h2>
        <form
          className="flex max-w-xl flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const name = String(data.get('name') ?? '').trim()
            update((s) => {
              if (!s.session) return
              if (name) s.session.name = name
              s.complianceProfile[`phone:${s.session.userId}`] = String(data.get('phone') ?? '').trim()
            })
            setSaved(true)
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" defaultValue={session.name} />
            </Field>
            <Field label="Phone" htmlFor="phone" hint="Fictional numbers only in the demo.">
              <Input id="phone" name="phone" type="tel" defaultValue={profile[`phone:${session.userId}`] ?? ''} placeholder="0400 000 000" />
            </Field>
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit">Save</Button>
            {saved && <p className="text-sm text-good">Saved.</p>}
          </div>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Quick links</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/my-listings/new" className="font-medium text-signal hover:text-signal-hover">
            New listing
          </Link>
          <Link href="/support/new" className="font-medium text-signal hover:text-signal-hover">
            New support ticket
          </Link>
          <Link href="/welcome" className="font-medium text-signal hover:text-signal-hover">
            Getting started
          </Link>
          {handlesLeads && (
            <Link href="/leads" className="font-medium text-signal hover:text-signal-hover">
              View requests
            </Link>
          )}
          {session.companyId && (
            <Link href="/dashboard" className="font-medium text-signal hover:text-signal-hover">
              Business dashboard
            </Link>
          )}
          {can(session.role, 'catalogue:write') && (
            <Link href="/admin" className="font-medium text-signal hover:text-signal-hover">
              Admin
            </Link>
          )}
        </div>
      </div>

      <Panel className="border-dashed border-caution/40 bg-caution-tint">
        <PanelBody className="flex flex-col gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-graphite">
              <DemoTag>Demo</DemoTag> Switch role
            </p>
            <p className="mt-1 text-sm text-graphite-soft">See the same demo from each side. Everything you do stays in this browser.</p>
          </div>
          <RoleSwitcher current={session.email} />
          <div className="flex flex-wrap gap-3 border-t border-caution/30 pt-4">
            <InlineConfirm
              look="button"
              label="Reset demo"
              question="Clear everything added in this browser?"
              confirmLabel="Yes, reset"
              onConfirm={resetDemo}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut()
                navigate('/')
              }}
            >
              Sign out
            </Button>
          </div>
        </PanelBody>
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Messages (src/app/messages/*)                                       */
/* ------------------------------------------------------------------ */

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function MessagesPage() {
  const session = useDemo((s) => s.session)
  const conversations = useDemo((s) => s.conversations)
  const accounts = useDemo((s) => s.accounts)
  if (!session) return <SignInPrompt next="/messages" title="Sign in to see your messages" />
  const views = conversationsFor(conversations, session, accounts)
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Messages</h1>
        <p className="mt-1 text-graphite-soft">Questions about a quote, and everything about a job you&apos;ve agreed.</p>
      </header>
      {views.length === 0 ? (
        <EmptyState title="No messages yet" description="Threads start from a quote, a job or a marketplace listing." />
      ) : (
        <ul className="flex flex-col gap-2">
          {views.map(({ conversation, counterpart, unread, flipped }) => {
            const latest = conversation.messages[conversation.messages.length - 1]
            const fromMe = latest && (flipped ? latest.from === 'them' : latest.from === 'me')
            return (
              <li key={conversation.id}>
                <Link href={`/messages/${conversation.id}`} className="block rounded-md border border-line bg-paper p-4 transition-colors hover:border-signal">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium text-graphite">
                      {counterpart}
                      {unread > 0 && <span className="ml-2 rounded-full bg-signal px-2 py-0.5 text-micro font-medium text-paper">{unread} new</span>}
                    </p>
                    {latest && <span className="text-micro text-zinc-deep">{shortDate(latest.at)}</span>}
                  </div>
                  <p className="mt-0.5 text-micro text-zinc-deep">{conversation.subject}</p>
                  {latest && (
                    <p className="mt-2 line-clamp-2 text-sm text-graphite-soft">
                      {fromMe && <span className="text-zinc-deep">You: </span>}
                      {latest.text}
                    </p>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function MessagePage({ params }: { params: Record<string, string> }) {
  const session = useDemo((s) => s.session)
  const conversations = useDemo((s) => s.conversations)
  const accounts = useDemo((s) => s.accounts)
  const [typing, setTyping] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const view = conversationsFor(conversations, session, accounts).find((v) => v.conversation.id === params.id)

  useEffect(() => {
    if (view && !view.flipped && view.conversation.unread > 0) {
      update((s) => {
        const c = s.conversations.find((x) => x.id === params.id)
        if (c) c.unread = 0
      })
    }
  }, [view, params.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [view?.conversation.messages.length])

  if (!session) return <SignInPrompt next={`/messages/${params.id}`} />
  if (!view) return <NotFoundPage />
  const { conversation, flipped, counterpart } = view
  const mineSide = flipped ? 'them' : 'me'
  const theirSide = flipped ? 'me' : 'them'

  const send = (text: string) => {
    update((s) => {
      const c = s.conversations.find((x) => x.id === conversation.id)
      c?.messages.push({ from: mineSide, text, at: new Date().toISOString() })
    })
    setTyping(true)
    window.setTimeout(() => {
      update((s) => {
        const c = s.conversations.find((x) => x.id === conversation.id)
        c?.messages.push({
          from: theirSide,
          text: flipped
            ? 'Thanks, that works for me. (Demo auto-reply: no real customer.)'
            : 'Thanks for the message, we’ll get back to you today. (Demo auto-reply: no real business.)',
          at: new Date().toISOString(),
        })
      })
      setTyping(false)
    }, 1400)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Link href="/messages" className="text-sm font-medium text-signal hover:text-signal-hover">
        ← Messages
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-graphite">{counterpart}</h1>
        <p className="mt-1 text-sm text-zinc-deep">{conversation.subject}</p>
      </header>
      <ol className="flex flex-col gap-3">
        {conversation.messages.map((m, i) => {
          const mine = m.from === mineSide
          return (
            <li key={i} className={mine ? 'flex justify-end' : 'flex justify-start'}>
              <div className={mine ? 'max-w-[85%] rounded-lg bg-signal px-4 py-2.5 text-paper' : 'max-w-[85%] rounded-lg border border-line bg-paper px-4 py-2.5 text-graphite'}>
                <p className="whitespace-pre-wrap text-sm">{m.text}</p>
                <p className={mine ? 'mt-1 text-micro text-paper/80' : 'mt-1 text-micro text-zinc-deep'}>
                  {mine ? 'You' : counterpart} · {new Date(m.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </li>
          )
        })}
        {typing && (
          <li className="flex justify-start">
            <p className="rounded-lg border border-line bg-paper px-4 py-2.5 text-sm text-zinc-deep">{counterpart} is typing…</p>
          </li>
        )}
      </ol>
      <div ref={endRef} />
      <form
        className="mt-6 flex flex-col gap-3 border-t border-line pt-4"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const text = String(new FormData(form).get('body') ?? '').trim()
          if (!text) return
          send(text)
          form.reset()
        }}
      >
        <Field label="Reply" htmlFor="body">
          <Textarea id="body" name="body" placeholder="Write a message" className="min-h-20" />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <p className="text-micro text-zinc-deep">Demo: messages stay in this browser. Nothing is emailed or texted.</p>
          <Button type="submit">Send</Button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Notifications (src/app/notifications/page.tsx)                      */
/* ------------------------------------------------------------------ */

export function NotificationsPage() {
  const session = useDemo((s) => s.session)
  const notifications = useDemo((s) => s.notifications)
  if (!session) return <SignInPrompt next="/notifications" />
  const mine = notifications.filter((n) => n.userId === session.userId)
  const unread = mine.filter((n) => !n.read).length
  const markRead = (ids: string[]) =>
    update((s) => {
      for (const n of s.notifications) if (ids.includes(n.id)) n.read = true
    })
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">Notifications</h1>
          <p className="mt-1 text-graphite-soft">Quotes, bookings and job updates. In the demo these appear here only: no email, text or push.</p>
        </div>
        {unread > 0 && (
          <Button type="button" variant="secondary" size="sm" onClick={() => markRead(mine.map((n) => n.id))}>
            Mark all as read
          </Button>
        )}
      </header>
      {mine.length === 0 ? (
        <EmptyState title="Nothing yet" description="When a business quotes, confirms or updates a job, you'll see it here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href}
                onClick={() => markRead([n.id])}
                className={`block rounded-md border p-4 transition-colors hover:border-signal ${n.read ? 'border-line bg-paper' : 'border-signal/40 bg-signal-tint'}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="font-medium text-graphite">{n.title}</p>
                  <span className="text-micro text-zinc-deep">{shortDate(n.at)}</span>
                </div>
                <p className="mt-1 text-sm text-graphite-soft">{n.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Saved (src/app/saved/page.tsx)                                      */
/* ------------------------------------------------------------------ */

export function SavedPage() {
  const session = useDemo((s) => s.session)
  const savedListings = useDemo((s) => s.savedListings)
  const listings = useDemo((s) => s.listings)
  const designs = useDemo((s) => s.savedDesigns)
  if (!session) return <SignInPrompt next="/saved" />
  const items = listings.filter((l) => savedListings.includes(l.id))
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-graphite">Saved</h1>
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Designs ({designs.length})</h2>
        {designs.length === 0 ? (
          <EmptyState
            title="No saved designs"
            description="Design a door, gate or shutter and press Save to keep it here."
            action={
              <Link href="/configure" className="font-medium text-signal hover:text-signal-hover">
                Open the designer
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {designs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper p-4">
                <span className="min-w-0">
                  <span className="block font-medium text-graphite">{d.name}</span>
                  <span className="block truncate text-sm text-zinc-deep">
                    {describeSpec(d.spec)
                      .slice(0, 4)
                      .map((r) => r.value)
                      .join(' · ')}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <Link href={`/configure?spec=${encodeURIComponent(JSON.stringify(d.spec))}`} className="text-sm font-medium text-signal hover:text-signal-hover">
                    Open
                  </Link>
                  <button
                    type="button"
                    className="text-sm font-medium text-bad hover:underline"
                    onClick={() =>
                      update((s) => {
                        s.savedDesigns = s.savedDesigns.filter((x) => x.id !== d.id)
                      })
                    }
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Marketplace items ({items.length})</h2>
        {items.length === 0 ? (
          <EmptyState
            title="Nothing saved"
            description="Tap “Save for later” on a marketplace listing."
            action={
              <Link href="/marketplace" className="font-medium text-signal hover:text-signal-hover">
                Browse the marketplace
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper p-4">
                <Link href={`/marketplace/${l.id}`} className="min-w-0">
                  <span className="block font-medium text-graphite hover:text-signal">{l.title}</span>
                  <span className="block font-code text-sm text-zinc-deep">{l.model}</span>
                </Link>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-graphite">{formatMoney(l.priceCents)}</span>
                  <button
                    type="button"
                    className="text-sm font-medium text-bad hover:underline"
                    onClick={() =>
                      update((s) => {
                        s.savedListings = s.savedListings.filter((id) => id !== l.id)
                      })
                    }
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Support (src/app/support/*)                                         */
/* ------------------------------------------------------------------ */

export function SupportPage() {
  const session = useDemo((s) => s.session)
  const tickets = useDemo((s) => s.tickets)
  const { pathname } = useLocation()
  const [open, setOpen] = useState(pathname === '/support/new')
  const [error, setError] = useState<string | null>(null)
  if (!session) return <SignInPrompt next="/support" />
  const mine = tickets.filter((t) => t.userId === session.userId)
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Support</h1>
        {!open && (
          <Button type="button" onClick={() => setOpen(true)}>
            New ticket
          </Button>
        )}
      </div>
      {open && (
        <form
          className="mt-6 flex flex-col gap-4 rounded-lg border border-line bg-paper p-5 shadow-panel"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const subject = String(data.get('subject') ?? '').trim()
            const body = String(data.get('body') ?? '').trim()
            if (subject.length < 3 || body.length < 10) {
              setError('Add a subject and a few words about the problem.')
              return
            }
            update((s) => {
              s.tickets.unshift({ id: makeId('T-'), userId: session.userId, subject, body, status: 'OPEN', at: new Date().toISOString() })
            })
            setError(null)
            setOpen(false)
          }}
        >
          <Field label="Subject" htmlFor="subject">
            <Input id="subject" name="subject" />
          </Field>
          <Field label="What's happening?" htmlFor="body">
            <Textarea id="body" name="body" />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <div className="flex items-center gap-4">
            <Button type="submit">Send to support</Button>
            <button type="button" className="text-sm font-medium text-signal" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <p className="text-micro text-zinc-deep">Demo: tickets stay in this browser. Nobody is contacted.</p>
        </form>
      )}
      <div className="mt-8">
        {mine.length === 0 ? (
          <EmptyState title="No support tickets" description="Raise one if something isn't working." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Subject</Th>
                <Th>Opened</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {mine.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <span className="font-medium">{t.subject}</span>
                    <span className="block text-micro text-zinc-deep">{t.body}</span>
                  </Td>
                  <Td>{shortDate(t.at)}</Td>
                  <Td>
                    <Badge tone={t.status === 'RESOLVED' ? 'good' : 'signal'}>{t.status === 'OPEN' ? 'Open' : t.status === 'PENDING' ? 'Pending' : 'Resolved'}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Guided tour (/demo)                                                 */
/* ------------------------------------------------------------------ */

type TourRole = DemoAccount['role']

const TOUR: Array<{ title: string; who: TourRole; href: string; linkLabel: string; note: string }> = [
  {
    title: 'Open and close the garage door',
    who: 'customer',
    href: '/',
    linkLabel: 'Go to the home page',
    note: 'The hero door on the home page opens and closes. Hire a pro, Design yours and every service tile work.',
  },
  {
    title: 'Design a door, gate or shutter in 3D',
    who: 'customer',
    href: '/configure',
    linkLabel: 'Open the designer',
    note: 'Sectional, roller and tilt doors, sliding and swing gates, fences and shutters. Change the size, colour, panels, windows and motor and the 3D view updates.',
  },
  {
    title: 'Compare installed quotes',
    who: 'customer',
    href: '/configure',
    linkLabel: 'Back to the designer',
    note: 'Press “Get installed quotes”, enter a postcode such as 2170 and compare up to eight fictional businesses side by side, with GST-inclusive totals.',
  },
  {
    title: 'Book a quote, then pay (simulated)',
    who: 'customer',
    href: '/quotes',
    linkLabel: 'Open your quotes',
    note: 'Book with your site details. The job page lets you act as the business too: confirm, schedule, post progress and finish. Payments are simulated; nothing is charged.',
  },
  {
    title: 'Leave a review',
    who: 'customer',
    href: '/jobs',
    linkLabel: 'Open your jobs',
    note: 'Once the work is finished, confirm it and leave a star rating. It shows on the business profile straight away.',
  },
  {
    title: 'Post a job for technicians',
    who: 'customer',
    href: '/request-technician',
    linkLabel: 'Post a job',
    note: 'Describe the job and your budget. It appears on the installer’s job board.',
  },
  {
    title: 'Quote on the job board',
    who: 'installer',
    href: '/leads',
    linkLabel: 'Open the job board',
    note: 'As the installer, send a quote on a local job. The customer sees it under My requests and can accept it.',
  },
  {
    title: 'Run a supplier business',
    who: 'supplier',
    href: '/dashboard',
    linkLabel: 'Open the supplier dashboard',
    note: 'Listings, stock, enquiries, automated prices and the quotes they produce.',
  },
  {
    title: 'Manage a manufacturer catalogue',
    who: 'manufacturer',
    href: '/dashboard',
    linkLabel: 'Open the manufacturer dashboard',
    note: 'Models, manuals, dealers stocking the brand and the catalogue screens in Admin.',
  },
  {
    title: 'Change a price as admin',
    who: 'admin',
    href: '/admin/pricing',
    linkLabel: 'Open price rules',
    note: 'Edit an indicative price (or raise every price by 5%) and compare quotes again as the customer: the new price is used straight away. Approve or suspend businesses, moderate reviews and reset the demo.',
  },
]

export function DemoGuidePage() {
  const session = useDemo((s) => s.session)
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-graphite">Guided tour</h1>
      <p className="mt-2 text-sm text-graphite-soft">
        Ten steps through Doorlink from every side. Each step says which demo account to use; the buttons sign you in with one tap. Demo only: fictional
        businesses, prices and reviews, and no real payments.
      </p>

      <Panel className="mt-6">
        <PanelBody className="flex flex-col gap-3">
          <p className="text-sm font-medium text-graphite">Demo accounts</p>
          <RoleSwitcher current={session?.email} />
          <p className="text-micro text-zinc-deep">
            Or sign in by hand: <span className="font-code">customer@demo.doorlink.test</span> (also installer@, supplier@, manufacturer@, admin@) with
            password <span className="font-code">{DEMO_PASSWORD}</span>.
          </p>
        </PanelBody>
      </Panel>

      <ol className="mt-8 flex flex-col gap-4">
        {TOUR.map((step, index) => {
          const account = DEMO_ACCOUNTS.find((a) => a.role === step.who)!
          const signedInAs = session?.email === account.email
          return (
            <li key={step.title} className="rounded-lg border border-line bg-paper p-4">
              <div className="flex items-start gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rail text-sm font-semibold text-graphite">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-medium text-graphite">{step.title}</h2>
                  <p className="mt-1 text-sm text-graphite-soft">{step.note}</p>
                  <p className="mt-2 text-micro text-zinc-deep">
                    As: {ROLE_LABEL[account.appRole]} ({account.email})
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    {signedInAs ? (
                      <Link href={step.href} className="text-sm font-medium text-signal hover:text-signal-hover">
                        {step.linkLabel} →
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-medium text-signal hover:text-signal-hover"
                        onClick={() => {
                          signInAs(account)
                          navigate(step.href)
                        }}
                      >
                        Sign in as {ROLE_LABEL[account.appRole].toLowerCase()} and go →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
