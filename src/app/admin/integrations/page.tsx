import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { Badge } from '@/components/ui/Badge'
import { missingVariables, PROVIDERS } from '@/lib/provider-checks'
import { CheckButton } from './CheckButton'

export const metadata: Metadata = { title: 'Integrations' }
export const dynamic = 'force-dynamic'

/**
 * What each outside service needs and whether it answers. Shows variable
 * names only: values are entered in the host's environment settings and
 * never displayed here.
 */
export default async function IntegrationsPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (!can(session.role, 'admin:settings')) redirect('/admin')
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
  const httpsSite = site.startsWith('https://')

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">Integrations</h1>
        <p className="mt-1 max-w-2xl text-sm text-graphite-soft">
          Keys go in the hosting environment’s settings (never in the code or this page). A missing service only switches off the feature named
          beside it. “Check connection” makes one read-only call: nothing is sent, charged or written.
        </p>
        {!httpsSite && (
          <p className="mt-3 max-w-2xl rounded-md border border-caution/30 bg-caution-tint p-3 text-sm text-graphite">
            NEXT_PUBLIC_SITE_URL is {site ? <code>{site}</code> : 'not set'}. Providers can only call back to a public https address, so set it to
            the live address before registering the callback URLs below.
          </p>
        )}
      </header>

      <ul className="flex flex-col gap-3">
        {PROVIDERS.map((provider) => {
          const missing = missingVariables(provider)
          const optionalMissing = (provider.optional ?? []).filter((name) => !process.env[name]?.trim())
          const tone = provider.notBuilt ? 'neutral' : missing.length ? (provider.core ? 'bad' : 'caution') : 'good'
          const label = provider.notBuilt ? 'Not built' : missing.length ? 'Needs keys' : 'Configured'
          return (
            <li key={provider.id} className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-semibold text-graphite">
                    {provider.name} <Badge tone={tone}>{label}</Badge>
                  </h2>
                  <p className="text-sm text-graphite-soft">{provider.feature}</p>
                </div>
                {!provider.notBuilt && <CheckButton provider={provider.id} />}
              </div>
              {provider.notBuilt && <p className="mt-2 text-sm text-graphite-soft">{provider.notBuilt}</p>}
              <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
                <dt className="text-graphite-soft">Variables</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {provider.required.map((name) => (
                    <code key={name} className={`rounded px-1.5 py-0.5 text-micro ${missing.includes(name) ? 'bg-bad/10 text-bad' : 'bg-rail text-graphite'}`}>
                      {name}
                      {missing.includes(name) ? ' · missing' : ''}
                    </code>
                  ))}
                  {(provider.optional ?? []).map((name) => (
                    <code key={name} className="rounded bg-rail px-1.5 py-0.5 text-micro text-graphite-soft">
                      {name} (optional{optionalMissing.includes(name) ? ', not set' : ''})
                    </code>
                  ))}
                </dd>
                {provider.callbacks?.map((callback) => (
                  <div key={callback.path} className="contents">
                    <dt className="text-graphite-soft">Callback</dt>
                    <dd className="min-w-0">
                      <code className="break-all text-micro text-graphite">{(site || '<NEXT_PUBLIC_SITE_URL>') + callback.path}</code>
                      {callback.events && <p className="text-micro text-graphite-soft">{callback.events}</p>}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
