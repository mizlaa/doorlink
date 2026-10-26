import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('authentication availability budget', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns healthy results without caching an identity across operations', async () => {
    const { runAuthOperation } = await import('./auth-service')
    expect(await runAuthOperation(async () => 'user-a')).toBe('user-a')
    expect(await runAuthOperation(async () => 'user-b')).toBe('user-b')
  })

  it('ends a hanging operation after 3 seconds and disables late cookie writes', async () => {
    const { runAuthOperation } = await import('./auth-service')
    let canWrite!: () => boolean
    let finish!: (value: string) => void
    const pending = runAuthOperation(async (context) => {
      canWrite = context.canWriteCookies
      return new Promise<string>((resolve) => { finish = resolve })
    })
    const rejected = expect(pending).rejects.toThrow('sign-in service is currently unreachable')
    expect(canWrite()).toBe(true)
    await vi.advanceTimersByTimeAsync(3000)
    await rejected
    expect(canWrite()).toBe(false)
    finish('late result')
    await Promise.resolve()
    expect(canWrite()).toBe(false)
  })

  it('fails immediately on a network failure, pauses probes, and recovers after cooldown', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)
    const { runAuthOperation, isAuthServiceUnavailable } = await import('./auth-service')
    await expect(runAuthOperation(({ fetch }) => fetch('https://example.test'))).rejects.toThrow('unreachable')
    expect(isAuthServiceUnavailable()).toBe(true)
    const run = vi.fn()
    await expect(runAuthOperation(run)).rejects.toThrow('unreachable')
    expect(run).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15000)
    expect(isAuthServiceUnavailable()).toBe(false)
    fetchMock.mockResolvedValue(new Response('healthy'))
    expect((await runAuthOperation(({ fetch }) => fetch('https://example.test'))).status).toBe(200)
  })

  it('aborts a hanging network request when its operation budget expires', async () => {
    let signal!: AbortSignal
    vi.stubGlobal('fetch', vi.fn((_input, init) => {
      signal = init.signal
      return new Promise(() => {})
    }))
    const { runAuthOperation } = await import('./auth-service')
    const pending = runAuthOperation(({ fetch }) => fetch('https://example.test'))
    const rejected = expect(pending).rejects.toThrow('unreachable')
    await vi.advanceTimersByTimeAsync(3000)
    await rejected
    expect(signal.aborted).toBe(true)
  })

  it('treats upstream 5xx as an outage but not invalid credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const { runAuthOperation, isAuthServiceUnavailable } = await import('./auth-service')
    expect((await runAuthOperation(({ fetch }) => fetch('https://example.test'))).status).toBe(400)
    expect(isAuthServiceUnavailable()).toBe(false)
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }))
    await expect(runAuthOperation(({ fetch }) => fetch('https://example.test'))).rejects.toThrow('unreachable')
  })

  it('prevents SDK background retries from making more network requests', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('DNS failure'))
    vi.stubGlobal('fetch', fetchMock)
    const { runAuthOperation } = await import('./auth-service')
    let retry!: () => Promise<Response>
    await expect(runAuthOperation(async ({ fetch }) => {
      retry = () => fetch('https://example.test')
      return retry()
    })).rejects.toThrow('unreachable')
    await expect(retry()).rejects.toThrow('unreachable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
