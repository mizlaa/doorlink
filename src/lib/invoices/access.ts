import 'server-only'

import { InvoiceStatus } from '@prisma/client'
import type { Session } from '@/lib/auth'
import { roleAtLeast, roleInBusiness } from '@/lib/business/access'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/rbac'
import { INVOICE_INCLUDE, type InvoiceFull } from './service'

export type InvoiceViewer = 'business' | 'customer' | 'admin'

/**
 * Who may open an invoice, checked on the server for every page, PDF and
 * receipt: a manager or owner of the business that raised it, the customer
 * it was issued to (never a draft), or an admin. Technicians don't see
 * invoices. Anyone else gets a 404, the same as a missing invoice.
 */
export async function invoiceForViewer(session: Session | null, id: string): Promise<{ invoice: InvoiceFull; viewer: InvoiceViewer } | null> {
  if (!session || !/^[a-z0-9]{10,40}$/.test(id)) return null
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE })
  if (!invoice) return null
  const role = await roleInBusiness(session, invoice.businessId)
  if (role && roleAtLeast(role, 'MANAGER')) return { invoice, viewer: 'business' }
  if (invoice.status !== InvoiceStatus.DRAFT && invoice.customer.userId && invoice.customer.userId === session.userId) return { invoice, viewer: 'customer' }
  if (can(session.role, 'job:write:any')) return { invoice, viewer: 'admin' }
  return null
}

/** A PDF response that is never cached by shared caches and never sniffed. */
export function pdfResponse(file: { bytes: Uint8Array; filename: string }, download: boolean): Response {
  return new Response(Buffer.from(file.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  })
}
