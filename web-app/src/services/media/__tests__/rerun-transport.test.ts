import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import {
  setPendingMediaReRun,
  takePendingMediaReRun,
  clearPendingMediaReRun,
  type PendingMediaReRun,
} from '../rerun'
import { mediaTransport } from '../transport'

const mocks = vi.hoisted(() => {
  return {
    tauriFetchArgs: [] as unknown[],
    globalFetchArgs: [] as unknown[],
  }
})

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn((input: unknown, init: unknown) => {
    mocks.tauriFetchArgs.push({ input, init })
    return Promise.resolve(new Response('tauri fetch response'))
  }),
}))

describe('Media Re-Run', () => {
  afterEach(() => {
    clearPendingMediaReRun()
  })

  it('set then take returns the request and clears it (second take is undefined)', () => {
    const request: PendingMediaReRun = {
      provider_id: 'provider1',
      model_id: 'model1',
      task: 'task1',
      params: { param1: 'value1' },
    }

    setPendingMediaReRun(request)

    const firstTake = takePendingMediaReRun()
    expect(firstTake).toStrictEqual({
      provider_id: 'provider1',
      model_id: 'model1',
      task: 'task1',
      params: { param1: 'value1' },
    })

    const secondTake = takePendingMediaReRun()
    expect(secondTake).toBeUndefined()
  })

  it('set overwrites a previous pending request', () => {
    const request1: PendingMediaReRun = {
      provider_id: 'provider1',
      model_id: 'model1',
      task: 'task1',
      params: { param1: 'value1' },
    }
    const request2: PendingMediaReRun = {
      provider_id: 'provider2',
      model_id: 'model2',
      task: 'task2',
      params: { param2: 'value2' },
    }

    setPendingMediaReRun(request1)
    setPendingMediaReRun(request2)

    const taken = takePendingMediaReRun()
    expect(taken).toStrictEqual({
      provider_id: 'provider2',
      model_id: 'model2',
      task: 'task2',
      params: { param2: 'value2' },
    })
  })

  it('clearPendingMediaReRun discards it', () => {
    const request: PendingMediaReRun = {
      provider_id: 'provider1',
      model_id: 'model1',
      task: 'task1',
      params: { param1: 'value1' },
    }

    setPendingMediaReRun(request)
    clearPendingMediaReRun()

    const taken = takePendingMediaReRun()
    expect(taken).toBeUndefined()
  })
})

describe('Media Transport', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    mocks.tauriFetchArgs = []
    mocks.globalFetchArgs = []
    globalThis.fetch = vi.fn((input: unknown, init: unknown) => {
      mocks.globalFetchArgs.push({ input, init })
      return Promise.resolve(new Response('global fetch response'))
    }) as typeof fetch
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
  })

  it('forwards exactly what the source forwards when IS_TAURI is true', async () => {
    vi.stubGlobal('IS_TAURI', true)

    const response = await mediaTransport('https://example.com/tauri', { method: 'POST' })

    const responseText = await response.text()
    expect(responseText).toBe('tauri fetch response')
    expect(mocks.tauriFetchArgs).toStrictEqual([
      {
        input: 'https://example.com/tauri',
        init: { method: 'POST' },
      },
    ])
    expect(mocks.globalFetchArgs).toStrictEqual([])
  })

  it('forwards exactly what the source forwards when IS_TAURI is false', async () => {
    vi.stubGlobal('IS_TAURI', false)

    const response = await mediaTransport('https://example.com/global', { method: 'GET' })

    const responseText = await response.text()
    expect(responseText).toBe('global fetch response')
    expect(mocks.globalFetchArgs).toStrictEqual([
      {
        input: 'https://example.com/global',
        init: { method: 'GET' },
      },
    ])
    expect(mocks.tauriFetchArgs).toStrictEqual([])
  })

  it('forwards exactly what the source forwards when IS_TAURI is undefined (throws)', async () => {
    // If IS_TAURI throws (e.g. ReferenceError for undeclared variable), it should fall back to false.
    // In vitest, stubbing to undefined makes `typeof IS_TAURI` equal to 'undefined'.
    vi.stubGlobal('IS_TAURI', undefined)

    const response = await mediaTransport('https://example.com/undefined', { method: 'PUT' })

    const responseText = await response.text()
    expect(responseText).toBe('global fetch response')
    expect(mocks.globalFetchArgs).toStrictEqual([
      {
        input: 'https://example.com/undefined',
        init: { method: 'PUT' },
      },
    ])
    expect(mocks.tauriFetchArgs).toStrictEqual([])
  })
})
