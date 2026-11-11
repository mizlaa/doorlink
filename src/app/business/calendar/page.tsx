import type { Metadata } from 'next'
import Link from 'next/link'
import { assignableTechnicians } from '@/lib/business/access'
import { businessPage } from '@/lib/business/guard'
import { appointmentsBetween, type AppointmentWithRelations } from '@/lib/appointments'
import { dayLabel, hourRange, monthGrid, monthLabel, placeDay, shiftDate, weekDays } from '@/lib/appointments/calendar'
import { isLive, KIND_LABELS, STATUS_LABELS } from '@/lib/appointments/rules'
import { dayRange, formatInZone, formatTimeRange, localDateString, parseDateString, zoneAbbreviation } from '@/lib/timezone'
import { Empty, PageHeader, PrimaryLink } from '@/components/business/ui'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Calendar' }

type View = 'day' | 'week' | 'month'
type PageProps = { searchParams: Promise<{ view?: string; date?: string; tech?: string }> }

const HOUR_PX = 56

const KIND_STYLES: Record<string, string> = {
  MEASURE: 'border-signal/40 bg-signal-tint text-graphite',
  INSTALL: 'border-good/40 bg-good/10 text-graphite',
  SERVICE: 'border-caution/40 bg-caution-tint text-graphite',
  REPAIR: 'border-bad/30 bg-bad/10 text-graphite',
  OTHER: 'border-line bg-paper text-graphite',
}

function blockClasses(a: AppointmentWithRelations) {
  if (!isLive(a.status) && a.status !== 'COMPLETED') return 'border-line bg-paper text-zinc-deep line-through decoration-zinc/60'
  if (a.status === 'COMPLETED') return 'border-line bg-paper text-graphite-soft'
  return KIND_STYLES[a.kind] ?? KIND_STYLES.OTHER
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const gate = await businessPage('MANAGER', '/business/calendar')
  if (!gate.ok) return gate.screen
  const { business } = gate
  const params = await searchParams
  const tz = business.timezone
  const today = localDateString(new Date(), tz)
  const view: View = params.view === 'day' || params.view === 'month' ? params.view : 'week'
  const date = params.date && parseDateString(params.date) ? params.date : today
  const tech = params.tech || ''

  const days = view === 'day' ? [date] : view === 'week' ? weekDays(date) : monthGrid(date).days
  const first = dayRange(days[0], tz)
  const last = dayRange(days[days.length - 1], tz)
  const [technicians, appointments] = await Promise.all([
    assignableTechnicians(business),
    first && last ? appointmentsBetween(business.businessId, first.start, last.end, tech || null) : Promise.resolve([]),
  ])
  // Cancelled visits stay off the grid in week and month views; the day view lists them.
  const shown = view === 'day' ? appointments : appointments.filter((a) => a.status !== 'CANCELLED')

  const href = (next: Partial<{ view: View; date: string; tech: string }>) => {
    const q = new URLSearchParams({ view: next.view ?? view, date: next.date ?? date })
    const t = next.tech ?? tech
    if (t) q.set('tech', t)
    return `/business/calendar?${q.toString()}`
  }
  const title =
    view === 'day'
      ? dayLabel(date)
      : view === 'week'
        ? `${dayLabel(days[0], { day: 'numeric', month: 'short' })} – ${dayLabel(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}`
        : monthLabel(date)

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={`Times are ${zoneAbbreviation(new Date(), tz)} (${tz.replace('Australia/', '')}).`}
        action={<PrimaryLink href={`/business/calendar/new?date=${date}`}>Book a visit</PrimaryLink>}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Link href={href({ date: shiftDate(date, view, -1) })} aria-label="Previous" className="flex h-10 w-10 items-center justify-center rounded border border-line bg-rail text-graphite hover:border-zinc">
            ‹
          </Link>
          <Link href={href({ date: today })} className="flex h-10 items-center rounded border border-line bg-rail px-3 text-sm font-medium text-graphite hover:border-zinc">
            Today
          </Link>
          <Link href={href({ date: shiftDate(date, view, 1) })} aria-label="Next" className="flex h-10 w-10 items-center justify-center rounded border border-line bg-rail text-graphite hover:border-zinc">
            ›
          </Link>
          <h2 className="ml-2 text-base font-semibold text-graphite">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line bg-rail p-1 text-sm font-medium" role="group" aria-label="View">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                aria-current={view === v ? 'true' : undefined}
                className={cn('rounded-md px-3.5 py-1.5 capitalize', view === v ? 'bg-graphite text-paper' : 'text-graphite-soft hover:text-graphite')}
              >
                {v}
              </Link>
            ))}
          </div>
          <form action="/business/calendar" className="flex items-center gap-2">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="date" value={date} />
            <label htmlFor="tech" className="sr-only">
              Technician
            </label>
            <select id="tech" name="tech" defaultValue={tech} className="field-select h-10 appearance-none rounded border border-line bg-rail pl-3 pr-10 text-sm text-graphite">
              <option value="">Everyone</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="unassigned">Unassigned</option>
            </select>
            <button type="submit" className="h-10 rounded border border-line bg-rail px-3 text-sm font-medium text-graphite hover:border-zinc">
              Show
            </button>
          </form>
        </div>
      </div>

      {view === 'month' ? (
        <MonthView days={days} month={monthGrid(date).month} today={today} appointments={shown} tz={tz} dayHref={(d) => href({ view: 'day', date: d })} />
      ) : (
        <>
          {/* Phones read the week as a list; wider screens get the time grid. */}
          <div className="md:hidden">
            <Agenda days={days} today={today} appointments={shown} tz={tz} newHref={(d) => `/business/calendar/new?date=${d}`} />
          </div>
          <div className="hidden md:block">
            <TimeGrid days={days} today={today} appointments={shown} tz={tz} dayHref={(d) => href({ view: 'day', date: d })} />
          </div>
        </>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-micro text-zinc-deep">
        {Object.entries(KIND_LABELS).map(([id, label]) => (
          <li key={id} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-sm border', KIND_STYLES[id])} /> {label}
          </li>
        ))}
      </ul>
    </>
  )
}

function Agenda({ days, today, appointments, tz, newHref }: { days: string[]; today: string; appointments: AppointmentWithRelations[]; tz: string; newHref: (day: string) => string }) {
  const any = appointments.length > 0
  return (
    <div className="flex flex-col gap-4">
      {!any && days.length === 1 && (
        <Empty title="Nothing booked" action={<PrimaryLink href={newHref(days[0])}>Book a visit</PrimaryLink>}>
          No visits on this day.
        </Empty>
      )}
      {days.map((day) => {
        const placed = placeDay(appointments, day, tz)
        if (placed.length === 0 && days.length > 1 && day !== today) return null
        return (
          <section key={day}>
            <h3 className={cn('mb-2 text-sm font-semibold', day === today ? 'text-signal' : 'text-graphite')}>
              {dayLabel(day, { weekday: 'long', day: 'numeric', month: 'short' })}
              {day === today && ' · Today'}
            </h3>
            {placed.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-zinc-deep">Nothing booked.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {placed.map(({ item }) => (
                  <li key={item.id}>
                    <Link href={`/business/calendar/${item.id}`} className={cn('block rounded-lg border px-3.5 py-3', blockClasses(item))}>
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                        <span>{formatTimeRange(item.startsAt, item.endsAt, tz)}</span>
                        <span className="text-micro font-medium">{item.status === 'BOOKED' ? KIND_LABELS[item.kind] : STATUS_LABELS[item.status]}</span>
                      </span>
                      <span className="mt-0.5 block text-sm">{item.title}</span>
                      <span className="mt-0.5 block text-micro text-zinc-deep">
                        {[item.technician?.name ?? 'Unassigned', item.property ? `${item.property.suburb}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
      {!any && days.length > 1 && <p className="text-sm text-zinc-deep">Nothing else booked this week.</p>}
    </div>
  )
}

function TimeGrid({ days, today, appointments, tz, dayHref }: { days: string[]; today: string; appointments: AppointmentWithRelations[]; tz: string; dayHref: (day: string) => string }) {
  const placedByDay = days.map((day) => placeDay(appointments, day, tz))
  const { from, to } = hourRange(placedByDay.flat())
  const hours = Array.from({ length: to - from }, (_, i) => from + i)
  const height = hours.length * HOUR_PX
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-rail">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((day) => (
          <Link key={day} href={dayHref(day)} className={cn('border-l border-line px-2 py-2 text-center text-sm hover:bg-paper', day === today ? 'font-semibold text-signal' : 'text-graphite')}>
            {dayLabel(day, days.length === 1 ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric' })}
          </Link>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="relative" style={{ height }}>
          {hours.map((hour, i) => (
            <span key={hour} className="absolute right-2 -translate-y-1/2 text-micro text-zinc-deep" style={{ top: i * HOUR_PX }}>
              {i === 0 ? '' : `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`}
            </span>
          ))}
        </div>
        {days.map((day, d) => (
          <div key={day} className={cn('relative border-l border-line', day === today && 'bg-signal/[0.05]')} style={{ height }}>
            {hours.map((hour, i) => (
              <div key={hour} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} />
            ))}
            {placedByDay[d].map(({ item, startMinute, endMinute, column, columns }) => {
              const top = ((Math.max(startMinute, from * 60) - from * 60) / 60) * HOUR_PX
              const bottom = ((Math.min(endMinute, to * 60) - from * 60) / 60) * HOUR_PX
              return (
                <Link
                  key={item.id}
                  href={`/business/calendar/${item.id}`}
                  title={`${formatTimeRange(item.startsAt, item.endsAt, tz)} · ${item.title}`}
                  className={cn('absolute overflow-hidden rounded border px-1.5 py-1 text-micro leading-tight shadow-sm hover:z-10 hover:shadow-md', blockClasses(item))}
                  style={{
                    top: top + 1,
                    height: Math.max(26, bottom - top - 2),
                    left: `calc(${(column / columns) * 100}% + 2px)`,
                    width: `calc(${100 / columns}% - 4px)`,
                  }}
                >
                  <span className="block font-semibold">{formatInZone(item.startsAt, tz, { hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="block truncate">{item.title}</span>
                  <span className="block truncate text-zinc-deep">{item.technician?.name ?? 'Unassigned'}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthView({ days, month, today, appointments, tz, dayHref }: { days: string[]; month: number; today: string; appointments: AppointmentWithRelations[]; tz: string; dayHref: (day: string) => string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-rail">
      <div className="grid grid-cols-7 border-b border-line text-center text-micro font-semibold uppercase tracking-wide text-zinc-deep">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const placed = placeDay(appointments, day, tz)
          const inMonth = Number(day.slice(5, 7)) === month
          return (
            <Link
              key={day}
              href={dayHref(day)}
              aria-label={`${dayLabel(day)}: ${placed.length} visit${placed.length === 1 ? '' : 's'}`}
              className={cn(
                'flex min-h-[4.5rem] flex-col gap-1 border-line p-1.5 text-left hover:bg-paper sm:min-h-28',
                i % 7 !== 0 && 'border-l',
                i >= 7 && 'border-t',
                !inMonth && 'bg-paper/60 text-zinc-deep'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-micro font-semibold',
                  day === today ? 'bg-signal text-paper' : inMonth ? 'text-graphite' : 'text-zinc-deep'
                )}
              >
                {Number(day.slice(8))}
              </span>
              {/* Phones show a count; wider screens show the first visits. */}
              {placed.length > 0 && <span className="rounded bg-signal-tint px-1 text-center text-micro font-semibold text-signal sm:hidden">{placed.length}</span>}
              <span className="hidden flex-col gap-0.5 sm:flex">
                {placed.slice(0, 3).map(({ item }) => (
                  <span key={item.id} className={cn('truncate rounded border px-1 text-micro', blockClasses(item))}>
                    {formatInZone(item.startsAt, tz, { hour: 'numeric', minute: '2-digit' }).replace(' ', '')} {item.title}
                  </span>
                ))}
                {placed.length > 3 && <span className="text-micro text-zinc-deep">+{placed.length - 3} more</span>}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
