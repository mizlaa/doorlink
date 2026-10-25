import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { model: { findMany } } }))

import sitemap, { dynamic } from './sitemap'

describe('database-backed sitemap', () => {
  beforeEach(() => {
    findMany.mockReset()
    findMany.mockResolvedValue([])
  })

  it('runs at request time so publishing does not require database tables during build', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('includes models when the database is ready', async () => {
    const updatedAt = new Date('2026-10-25T00:00:00Z')
    findMany.mockResolvedValue([{ id: 'demo', updatedAt }])
    expect(await sitemap()).toContainEqual({
      url: expect.stringMatching(/\/model\/demo$/),
      lastModified: updatedAt,
    })
  })

  it('retains static public routes during a database connection outage', async () => {
    findMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unreachable', {
      code: 'P1001',
      clientVersion: '5.22.0',
    }))
    const entries = await sitemap()
    expect(entries).toHaveLength(5)
    expect(entries.some((entry) => entry.url.endsWith('/marketplace'))).toBe(true)
  })

  it('does not hide an incomplete production schema', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('missing Model table', {
      code: 'P2021',
      clientVersion: '5.22.0',
    })
    findMany.mockRejectedValue(error)
    await expect(sitemap()).rejects.toBe(error)
  })
})
