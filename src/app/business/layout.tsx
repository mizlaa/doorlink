import type { ReactNode } from 'react'
import { getSession } from '@/lib/auth'
import { currentBusiness, roleAtLeast } from '@/lib/business/access'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { prisma } from '@/lib/prisma'
import { BusinessNav, type BusinessNavItem } from './BusinessNav'

/**
 * The business area: requests, calendar, jobs, customers, invoices,
 * stock, reports, team and settings. The navigation shows what this
 * person's role can use; each page checks access itself.
 */
export default async function BusinessLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  let items: BusinessNavItem[] = []
  let name: string | null = null
  if (session) {
    try {
      const business = await currentBusiness(session)
      if (business) {
        name = business.name
        if (roleAtLeast(business.role, 'MANAGER')) {
          const [pending, overdue] = await Promise.all([
            prisma.serviceRequestRecipient.count({ where: { businessId: business.businessId, status: 'PENDING', request: { status: 'OPEN' } } }),
            prisma.invoice.count({ where: { businessId: business.businessId, status: 'ISSUED', dueDate: { lt: new Date() }, paidCents: { lt: prisma.invoice.fields.totalCents } } }),
          ])
          items = [
            { href: '/business', label: 'Overview' },
            { href: '/business/requests', label: 'Requests', count: pending },
            { href: '/business/calendar', label: 'Calendar' },
            { href: '/business/jobs', label: 'Jobs' },
            { href: '/business/customers', label: 'Customers' },
            { href: '/business/invoices', label: 'Invoices', count: overdue },
            { href: '/business/stock', label: 'Stock' },
            { href: '/business/reports', label: 'Reports' },
            ...(business.role === 'OWNER'
              ? [
                  { href: '/business/team', label: 'Team' },
                  { href: '/business/settings', label: 'Settings' },
                ]
              : []),
          ]
        } else {
          items = [{ href: '/today', label: 'Today' }]
        }
      }
    } catch (error) {
      if (!isDatabaseUnreachable(error)) throw error
    }
  }

  return (
    <div className="mx-auto w-full max-w-shell px-4 py-6 sm:py-8 print:max-w-none print:p-0">
      {items.length > 0 && (
        <div className="mb-6 border-b border-line pb-3 print:hidden">
          {name && <p className="mb-2 text-micro font-semibold uppercase tracking-wide text-zinc-deep">{name}</p>}
          <BusinessNav items={items} />
        </div>
      )}
      {children}
    </div>
  )
}
