import { Role } from '@prisma/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { roleRequiresTradeSubscription } from './trade-subscription'

vi.mock('./prisma', () => ({
  prisma: {
    subscription: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('./db-errors', () => ({
  isDatabaseUnreachable: vi.fn(),
}))

describe('roleRequiresTradeSubscription', () => {
  it('requires a subscription for trade roles only', () => {
    expect(roleRequiresTradeSubscription(Role.TECHNICIAN)).toBe(true)
    expect(roleRequiresTradeSubscription(Role.SUPPLIER)).toBe(true)
    expect(roleRequiresTradeSubscription(Role.MANUFACTURER)).toBe(true)
    expect(roleRequiresTradeSubscription(Role.CUSTOMER)).toBe(false)
    expect(roleRequiresTradeSubscription(Role.ADMIN)).toBe(false)
  })
})

describe('tradeSubscriptionAccess', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows customers without querying subscription', async () => {
    const { tradeSubscriptionAccess } = await import('./trade-subscription')
    const { prisma } = await import('./prisma')

    const result = await tradeSubscriptionAccess({
      userId: 'u1',
      role: Role.CUSTOMER,
      email: 'a@example.com',
      name: 'A',
      organizationId: null,
    })

    expect(result).toEqual({ allowed: true })
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled()
  })

  it('blocks a trade user with no active subscription', async () => {
    const { tradeSubscriptionAccess } = await import('./trade-subscription')
    const { prisma } = await import('./prisma')
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null)

    const result = await tradeSubscriptionAccess({
      userId: 'u1',
      role: Role.TECHNICIAN,
      email: 't@example.com',
      name: 'T',
      organizationId: null,
    })

    expect(result).toEqual({ allowed: false, reason: 'subscription_required' })
  })

  it('allows a trade user with an active subscription', async () => {
    const { tradeSubscriptionAccess } = await import('./trade-subscription')
    const { prisma } = await import('./prisma')
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({ id: 'sub1' } as never)

    const result = await tradeSubscriptionAccess({
      userId: 'u1',
      role: Role.TECHNICIAN,
      email: 't@example.com',
      name: 'T',
      organizationId: null,
    })

    expect(result).toEqual({ allowed: true })
  })

  it('allows trade access when the database is unreachable', async () => {
    const { tradeSubscriptionAccess } = await import('./trade-subscription')
    const { prisma } = await import('./prisma')
    const { isDatabaseUnreachable } = await import('./db-errors')
    const err = new Error('db down')
    vi.mocked(prisma.subscription.findFirst).mockRejectedValue(err)
    vi.mocked(isDatabaseUnreachable).mockReturnValue(true)

    const result = await tradeSubscriptionAccess({
      userId: 'u1',
      role: Role.SUPPLIER,
      email: 's@example.com',
      name: 'S',
      organizationId: null,
    })

    expect(result).toEqual({ allowed: true, failOpen: true })
  })
})
