import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { formatMoney } from '@/lib/money'
import { aiSettings } from '@/lib/ai/settings'
import { aiImagesAvailable, AI_MODEL } from '@/lib/ai/design-image'
import { AiSettingsForm } from './AiSettingsForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'AI usage' }

const DAY = 86_400_000

async function window(days: number) {
  const since = new Date(Date.now() - days * DAY)
  const [billable, cached, failed, spend] = await Promise.all([
    prisma.aiGeneration.count({ where: { createdAt: { gte: since }, cached: false, status: 'SUCCEEDED' } }),
    prisma.aiGeneration.count({ where: { createdAt: { gte: since }, cached: true } }),
    prisma.aiGeneration.count({ where: { createdAt: { gte: since }, status: 'FAILED' } }),
    prisma.aiGeneration.aggregate({ where: { createdAt: { gte: since } }, _sum: { costCents: true } }),
  ])
  return { billable, cached, failed, spendCents: spend._sum.costCents ?? 0 }
}

export default async function AdminAiPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'admin:settings')) redirect('/admin')

  const [settings, today, week, month, unpriced, topUsers, recent] = await Promise.all([
    aiSettings(),
    window(1),
    window(7),
    window(30),
    prisma.aiGeneration.count({ where: { cached: false, status: 'SUCCEEDED', costCents: null } }),
    prisma.aiGeneration.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: new Date(Date.now() - 30 * DAY) }, cached: false },
      _count: { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 10,
    }),
    prisma.aiGeneration.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { name: true, email: true } } },
    }),
  ])
  const users = await prisma.user.findMany({
    where: { id: { in: topUsers.map((u) => u.userId).filter((id): id is string => !!id) } },
    select: { id: true, name: true, email: true },
  })
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? 'Deleted account'

  const stats = [
    { label: 'Today', ...today },
    { label: 'Last 7 days', ...week },
    { label: 'Last 30 days', ...month },
  ]

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-lg font-semibold text-graphite">AI generation</h2>
        <p className="mt-1 max-w-prose text-sm text-graphite-soft">
          Free for customers; Doorlink pays the image provider ({AI_MODEL}). Identical designs are served from the
          cache at no cost. {aiImagesAvailable() ? 'The provider is connected.' : 'No provider key is set (OPENAI_API_KEY), so generation is off.'}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-line bg-paper p-4">
              <p className="text-micro font-semibold uppercase tracking-wide text-zinc-deep">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold text-graphite">
                {settings.costPerImageCents === null && s.billable > 0 ? '—' : formatMoney(s.spendCents)}
              </p>
              <p className="text-sm text-graphite-soft">
                {s.billable} generated · {s.cached} from cache · {s.failed} failed
              </p>
            </div>
          ))}
        </div>
        {unpriced > 0 && (
          <p className="mt-3 text-sm text-caution">
            {unpriced} image{unpriced === 1 ? ' was' : 's were'} made before a cost per image was set, so {unpriced === 1 ? 'it isn’t' : 'they aren’t'} in the spend figures.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-graphite">Settings</h2>
        <div className="mt-4">
          <AiSettingsForm
            initial={{
              cost: settings.costPerImageCents === null ? '' : (settings.costPerImageCents / 100).toFixed(2),
              perHour: settings.perUserPerHour,
              perDay: settings.perUserPerDay,
              dailyCap: settings.dailyCap,
            }}
          />
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold text-graphite">Heaviest users, 30 days</h2>
          {topUsers.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-deep">No generations yet.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-1 text-sm">
              {topUsers.map((u) => (
                <li key={u.userId ?? 'none'} className="flex justify-between rounded-md border border-line bg-paper px-3 py-2">
                  <span>{nameOf(u.userId)}</span>
                  <span className="font-medium">{u._count._all}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-graphite">Recent activity</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-deep">No generations yet.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-1 text-sm">
              {recent.map((g) => (
                <li key={g.id} className="flex flex-wrap justify-between gap-2 rounded-md border border-line bg-paper px-3 py-2">
                  <span>
                    {g.user?.name ?? 'Deleted account'} · {g.productType}
                    {g.hasPhoto ? ' · with photo' : ''}
                  </span>
                  <span className={g.status === 'FAILED' ? 'text-bad' : g.cached ? 'text-zinc-deep' : 'text-graphite'}>
                    {g.status === 'FAILED' ? 'failed' : g.cached ? 'cache' : g.costCents !== null ? formatMoney(g.costCents) : 'generated'} ·{' '}
                    {g.createdAt.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}
