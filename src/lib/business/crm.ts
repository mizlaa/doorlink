import 'server-only'

import type { Prisma } from '@prisma/client'

/**
 * A business's customer and property records. Created the first time a
 * customer's request or booking reaches the business, from what the
 * customer already typed, so nobody at the business retypes a name or an
 * address. Later work for the same person or place reuses the record.
 */

type Tx = Prisma.TransactionClient

export interface ContactInput {
  userId: string | null
  name: string
  email: string | null
  phone: string | null
}

export interface AddressInput {
  addressLine: string
  suburb: string
  state: string
  postcode: string
}

const tidy = (value: string) => value.trim().replace(/\s+/g, ' ')

export async function upsertBusinessCustomer(tx: Tx, businessId: string, contact: ContactInput) {
  const email = contact.email?.trim().toLowerCase() || null
  const existing = contact.userId
    ? await tx.businessCustomer.findUnique({ where: { businessId_userId: { businessId, userId: contact.userId } } })
    : email
      ? await tx.businessCustomer.findFirst({ where: { businessId, email, archivedAt: null } })
      : null
  if (existing) {
    // Fill gaps, never overwrite what the business has since corrected.
    return tx.businessCustomer.update({
      where: { id: existing.id },
      data: {
        phone: existing.phone ?? contact.phone,
        email: existing.email ?? email,
        userId: existing.userId ?? contact.userId,
      },
    })
  }
  return tx.businessCustomer.create({
    data: { businessId, userId: contact.userId, name: tidy(contact.name), email, phone: contact.phone?.trim() || null },
  })
}

export async function upsertProperty(tx: Tx, businessId: string, customerId: string, address: AddressInput) {
  const addressLine = tidy(address.addressLine)
  const existing = await tx.property.findFirst({
    where: { businessId, customerId, postcode: address.postcode, addressLine: { equals: addressLine, mode: 'insensitive' } },
  })
  if (existing) return existing
  return tx.property.create({
    data: {
      businessId,
      customerId,
      addressLine,
      suburb: tidy(address.suburb),
      state: address.state,
      postcode: address.postcode,
    },
  })
}

export function formatAddress(property: { addressLine: string; suburb: string; state: string; postcode: string } | null): string {
  return property ? `${property.addressLine}, ${property.suburb} ${property.state} ${property.postcode}` : ''
}
