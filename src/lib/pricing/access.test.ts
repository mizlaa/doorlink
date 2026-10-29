import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/auth'
import { can } from '@/lib/rbac'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/motors/catalogue', () => ({ loadMotorCandidates: vi.fn(async () => []) }))

const {
  businessKeyFor,
  decodeBusinessKey,
  encodeBusinessKey,
  quoteBusinessWhere,
  ruleOwnerData,
  ruleOwnerWhere,
} = await import('./business')
const { canViewQuote } = await import('./quotes')

function session(overrides: Partial<Session>): Session {
  return { userId: 'u-cust', email: 'x@y.z', name: 'X', role: 'CUSTOMER', organizationId: null, ...overrides }
}

const customer = session({})
const otherCustomer = session({ userId: 'u-other' })
const techA = session({ userId: 'u-techA', role: 'TECHNICIAN' })
const techB = session({ userId: 'u-techB', role: 'TECHNICIAN' })
const supplierOrgA = session({ userId: 'u-supA', role: 'SUPPLIER', organizationId: 'org-a' })
const staffOrgA = session({ userId: 'u-staffA', role: 'SUPPLIER', organizationId: 'org-a' })
const supplierOrgB = session({ userId: 'u-supB', role: 'SUPPLIER', organizationId: 'org-b' })
const admin = session({ userId: 'u-admin', role: 'ADMIN' })

describe('permissions', () => {
  it('lets only technicians and suppliers set prices — not customers, manufacturers or platform admins', () => {
    expect(can('TECHNICIAN', 'pricing:write:own')).toBe(true)
    expect(can('SUPPLIER', 'pricing:write:own')).toBe(true)
    expect(can('CUSTOMER', 'pricing:write:own')).toBe(false)
    expect(can('MANUFACTURER', 'pricing:write:own')).toBe(false)
    expect(can('ADMIN', 'pricing:write:own')).toBe(false)
  })

  it('lets only customers request automated quotes', () => {
    expect(can('CUSTOMER', 'quote:request')).toBe(true)
    for (const role of ['TECHNICIAN', 'SUPPLIER', 'MANUFACTURER', 'ADMIN'] as const) {
      expect(can(role, 'quote:request')).toBe(false)
    }
  })
})

describe('business ownership', () => {
  it('scopes an organisation’s rules to the organisation, and a sole trader’s to the account', () => {
    expect(ruleOwnerWhere(businessKeyFor(supplierOrgA))).toEqual({ organizationId: 'org-a' })
    expect(ruleOwnerWhere(businessKeyFor(techA))).toEqual({ ownerId: 'u-techA', organizationId: null })
    expect(ruleOwnerData(businessKeyFor(techA))).toEqual({ ownerId: 'u-techA' })
  })

  it('gives staff of one organisation the same business, and other businesses a different one', () => {
    expect(businessKeyFor(staffOrgA)).toEqual(businessKeyFor(supplierOrgA))
    expect(businessKeyFor(supplierOrgB)).not.toEqual(businessKeyFor(supplierOrgA))
    expect(businessKeyFor(techB)).not.toEqual(businessKeyFor(techA))
  })

  it('scopes issued quotes the same way', () => {
    expect(quoteBusinessWhere(businessKeyFor(techA))).toEqual({
      businessUserId: 'u-techA',
      businessOrganizationId: null,
    })
    expect(quoteBusinessWhere(businessKeyFor(supplierOrgA))).toEqual({ businessOrganizationId: 'org-a' })
  })

  it('round-trips business keys and rejects junk', () => {
    const key = businessKeyFor(supplierOrgA)
    expect(decodeBusinessKey(encodeBusinessKey({ kind: 'user', id: 'ckabcdefghij' }))).toEqual({
      kind: 'user',
      id: 'ckabcdefghij',
    })
    expect(encodeBusinessKey(key)).toBe('o_org-a')
    expect(decodeBusinessKey('o_org-a')).toEqual({ kind: 'organization', id: 'org-a' })
    expect(decodeBusinessKey('o_')).toBeNull()
    expect(decodeBusinessKey('o_a/b')).toBeNull()
    expect(decodeBusinessKey('x_ckabcdefghij')).toBeNull()
    expect(decodeBusinessKey("u_'; drop table")).toBeNull()
  })
})

describe('canViewQuote', () => {
  const soleTraderQuote = { customerId: 'u-cust', businessUserId: 'u-techA', businessOrganizationId: null }
  const orgQuote = { customerId: 'u-cust', businessUserId: null, businessOrganizationId: 'org-a' }

  it('shows a quote to the customer it was issued to', () => {
    expect(canViewQuote(customer, soleTraderQuote)).toBe(true)
  })

  it('shows a quote to the business that issued it, including its staff', () => {
    expect(canViewQuote(techA, soleTraderQuote)).toBe(true)
    expect(canViewQuote(supplierOrgA, orgQuote)).toBe(true)
    expect(canViewQuote(staffOrgA, orgQuote)).toBe(true)
  })

  it('hides it from every other business, customer, platform admin and signed-out visitor', () => {
    expect(canViewQuote(techB, soleTraderQuote)).toBe(false)
    expect(canViewQuote(supplierOrgB, orgQuote)).toBe(false)
    expect(canViewQuote(supplierOrgA, soleTraderQuote)).toBe(false)
    expect(canViewQuote(otherCustomer, soleTraderQuote)).toBe(false)
    expect(canViewQuote(admin, soleTraderQuote)).toBe(false)
    expect(canViewQuote(null, soleTraderQuote)).toBe(false)
  })

  it('does not let a sole trader who later joins an organisation keep reading as the old business', () => {
    expect(canViewQuote({ ...techA, organizationId: 'org-b' }, soleTraderQuote)).toBe(false)
  })
})
