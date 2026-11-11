import type { Metadata } from 'next'
import Link from 'next/link'
import { businessPage } from '@/lib/business/guard'
import { prisma } from '@/lib/prisma'
import { Empty, PageHeader, PrimaryLink } from '@/components/business/ui'
import { Input } from '@/components/ui/Field'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Customers' }

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const gate = await businessPage('MANAGER', '/business/customers')
  if (!gate.ok) return gate.screen
  const { business } = gate
  const q = ((await searchParams).q ?? '').trim().slice(0, 60)
  const customers = await prisma.businessCustomer.findMany({
    where: {
      businessId: business.businessId,
      archivedAt: null,
      ...(q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { properties: { some: { OR: [{ suburb: { contains: q, mode: 'insensitive' } }, { addressLine: { contains: q, mode: 'insensitive' } }] } } }] }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: { id: true, name: true, phone: true, email: true, properties: { select: { suburb: true }, take: 1 }, _count: { select: { jobs: true, invoices: true } } },
  })
  return (
    <>
      <PageHeader title="Customers" action={<PrimaryLink href="/business/invoices/new">New invoice</PrimaryLink>} subtitle="Created automatically from requests, bookings and invoices. Nobody types a customer twice." />
      <form className="mb-4 max-w-sm" role="search">
        <Input name="q" defaultValue={q} placeholder="Name, phone, email or suburb" aria-label="Search customers" />
      </form>
      {customers.length === 0 ? (
        <Empty title={q ? 'No match' : 'No customers yet'}>{q ? 'Try another name, phone or suburb.' : 'They appear when you accept a request or a customer books your quote.'}</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-rail">
          {customers.map((c) => (
            <li key={c.id}>
              <Link href={`/business/customers/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-paper">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-graphite">{c.name}</span>
                  <span className="block truncate text-micro text-zinc-deep">{[c.properties[0]?.suburb, c.phone, c.email].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="shrink-0 text-micro text-zinc-deep">
                  {c._count.jobs} job{c._count.jobs === 1 ? '' : 's'} · {c._count.invoices} invoice{c._count.invoices === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
