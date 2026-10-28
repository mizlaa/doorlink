import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { categoryInfo } from '@/lib/quoting/catalogue'
import { publicCompany } from '@/lib/quoting/quotes'
import { NotConnected } from '@/components/ui/NotConnected'
import { Stars } from '@/components/quote/Stars'

// Per-user and per-business data: always rendered on request, never at build time.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Company profile' }

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let company
  try {
    company = await publicCompany(id)
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return <div className="mx-auto max-w-shell px-4 py-10"><NotConnected feature="Company profiles" reason="Can't reach the database right now." /></div>
  }
  if (!company) notFound()
  const p = company.profile
  const facts = [
    { label: 'Service area', value: p?.serviceArea },
    { label: 'Phone', value: p?.phone },
    { label: 'Website', value: p?.website },
    { label: 'ABN', value: p?.abn },
  ]
  return (
    <div className="mx-auto w-full min-w-0 max-w-shell px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite">{company.name}</h1>
        <div className="mt-2"><Stars rating={company.rating} /></div>
        <p className="mt-2 text-sm text-zinc-deep">Gives automated quotes for: {company.categories.map((c) => categoryInfo(c).plural.toLowerCase()).join(', ')}.</p>
      </header>

      <section className="mb-10 max-w-2xl">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-deep">About</h2>
        <p className="whitespace-pre-line text-graphite-soft">{p?.about ?? 'This company has not added a description.'}</p>
        <dl className="mt-4 grid gap-y-1.5">
          {facts.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-4 border-b border-line pb-1.5">
              <dt className="text-sm text-zinc-deep">{f.label}</dt>
              <dd className="min-w-0 break-words text-right text-sm text-graphite">
                {f.value ? (f.label === 'Website' ? <a href={f.value} rel="nofollow noopener noreferrer" target="_blank" className="text-signal hover:text-signal-hover">{f.value.replace(/^https?:\/\//, '')}</a> : f.value) : <span className="text-zinc-deep">Not provided</span>}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-micro text-zinc-deep">Details are supplied by the company and have not been checked by Doorlink.</p>
      </section>

      <section className="max-w-2xl">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-deep">Reviews</h2>
        <p className="mb-4 text-micro text-zinc-deep">Left by customers on completed Doorlink jobs carried out by this company&apos;s technicians.</p>
        {company.reviews.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-zinc-deep">No reviews yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {company.reviews.map((r) => (
              <li key={r.id} className="rounded-md border border-line bg-paper p-4">
                <Stars rating={{ average: r.rating, count: 1 }} single />
                {r.body && <p className="mt-2 text-sm text-graphite">{r.body}</p>}
                <p className="mt-2 text-micro text-zinc-deep">{r.author} · {r.createdAt.toLocaleDateString('en-AU')}</p>
                {r.workerReply && <p className="mt-2 rounded bg-rail p-2 text-sm text-graphite-soft">Reply: {r.workerReply}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10"><Link href="/quote" className="font-medium text-signal hover:text-signal-hover">Get a quote</Link></p>
    </div>
  )
}
