import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WELCOME_CREDITS } from './constants'

const { findUnique, transaction, upsert, updateMany, createLedger } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  transaction: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  createLedger: vi.fn(),
}))
vi.mock('../prisma', () => ({
  prisma: { creditBalance: { findUnique }, $transaction: transaction },
}))

import { getWelcomeCreditBalance } from './credits'

describe('welcome credit balance on navigation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    updateMany.mockResolvedValue({ count: 1 })
    transaction.mockImplementation(async (run) => run({
      creditBalance: { upsert, updateMany },
      creditLedger: { create: createLedger },
    }))
  })

  it('does not run a write transaction for returning users', async () => {
    findUnique.mockResolvedValue({ balance: 12, welcomeGranted: true })
    expect(await getWelcomeCreditBalance('returning')).toBe(12)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('does not grant credits again when the balance is zero', async () => {
    findUnique.mockResolvedValue({ balance: 0, welcomeGranted: true })
    expect(await getWelcomeCreditBalance('empty')).toBe(0)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('uses the existing atomic grant for a first visit', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ balance: WELCOME_CREDITS })
    expect(await getWelcomeCreditBalance('first')).toBe(WELCOME_CREDITS)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(createLedger).toHaveBeenCalledTimes(1)
  })

  it('still grants an existing balance that has not received welcome credits', async () => {
    findUnique.mockResolvedValueOnce({ balance: 1, welcomeGranted: false })
      .mockResolvedValueOnce({ balance: 1 + WELCOME_CREDITS })
    expect(await getWelcomeCreditBalance('pending')).toBe(1 + WELCOME_CREDITS)
    expect(transaction).toHaveBeenCalledTimes(1)
  })
})
