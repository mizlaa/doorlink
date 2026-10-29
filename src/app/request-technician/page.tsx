import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { NotConnected } from '@/components/ui/NotConnected'
import { describeSpec, familyOf, parseSpec, specAsBrief } from '@/lib/configurator/options'
import { RequestForm } from './RequestForm'

export const metadata: Metadata = {
  title: 'Post a job',
  description:
    'Describe the work, get quotes from door and gate technicians in your area, and choose who to hire.',
  alternates: { canonical: '/request-technician' },
}

type PageProps = { searchParams: Promise<{ spec?: string }> }

export default async function RequestTechnicianPage({ searchParams }: PageProps) {
  const { spec } = await searchParams
  const session = await getSession()

  // A door designed in the configurator arrives as a spec in the query
  // string. It is re-parsed here rather than trusted, and it prefills the
  // form rather than submitting anything on the customer's behalf — they
  // still read it and press the button.
  let prefill: { title: string; message: string } | undefined
  if (spec) {
    try {
      const parsed = parseSpec(JSON.parse(spec))
      const type = describeSpec(parsed)[0]?.value ?? 'garage door'
      const garage = familyOf(parsed.productType) === 'garage'
      // "Roller shutter" and "Sliding gate" already name the product; a
      // garage door type ("Sectional") does not.
      const product = garage ? `${type.toLowerCase()} garage door` : type.toLowerCase()
      prefill = {
        title: `New ${product}: supply and install`,
        message: `I've designed a ${garage ? 'door' : product} in the Doorlink configurator and would like a price to supply and install it.\n\n${specAsBrief(parsed)}\n\nThese are Doorlink's generic options rather than a specific product, so let me know the nearest equivalent you can supply.`,
      }
    } catch {
      prefill = undefined
    }
  }

  let serviceCategories
  let models
  try {
    ;[serviceCategories, models] = await Promise.all([
      prisma.serviceCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, description: true },
      }),
      prisma.model.findMany({
        orderBy: { name: 'asc' },
        include: { manufacturer: { select: { name: true } } },
      }),
    ])
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    return (
      <div className="mx-auto max-w-shell px-4 py-10">
        <NotConnected feature="Posting a job" reason="Can't reach the database right now." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite sm:text-3xl">Post a job</h1>
        <p className="mt-2 text-graphite-soft">Local technicians quote. You pick who to hire.</p>
      </header>

      <RequestForm
        prefill={prefill}
        signedIn={Boolean(session)}
        serviceCategories={serviceCategories.map((c) => ({
          id: c.id,
          label: c.name,
          description: c.description,
        }))}
        models={models.map((model) => ({
          id: model.id,
          label: `${model.modelCode} | ${model.manufacturer.name} ${model.name}`,
        }))}
      />
    </div>
  )
}
