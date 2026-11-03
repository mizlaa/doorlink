import { describe, expect, it, vi } from 'vitest'
import { NotDemoDatabaseError } from './guard'
import { resetDemoDatabase, seedDemo } from './seed'

// The fake client records any call. A refused seed must make none.
function recordingPrisma() {
  const calls: string[] = []
  const handler = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, prop) => (...args: unknown[]) => {
          calls.push(`${name}.${String(prop)}(${args.length})`)
          return Promise.resolve([])
        },
      }
    )
  const client = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => handler(String(prop)),
  })
  return { client: client as never, calls }
}

describe('demo seed safety', () => {
  it('refuses to reset a database whose name is not a demo name, before touching it', async () => {
    const { client, calls } = recordingPrisma()
    await expect(resetDemoDatabase(client, 'postgresql://u:p@localhost:5432/doorlink')).rejects.toThrow(
      NotDemoDatabaseError
    )
    expect(calls).toEqual([])
  })

  it('refuses to seed against a production-looking database', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@db.example.test:5432/doorlink_production')
    const { client, calls } = recordingPrisma()
    await expect(seedDemo(client)).rejects.toThrow(/looks like production/)
    expect(calls).toEqual([])
    vi.unstubAllEnvs()
  })
})
