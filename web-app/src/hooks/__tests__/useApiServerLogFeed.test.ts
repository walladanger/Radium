import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'

import {
  API_SERVER_LOG_CLEAR_COMMAND,
  API_SERVER_LOG_SNAPSHOT_COMMAND,
  API_SERVER_LOG_SUBSCRIBE_COMMAND,
  API_SERVER_REQUEST_FINISHED_EVENT,
  API_SERVER_REQUEST_PROGRESS_EVENT,
  API_SERVER_REQUEST_STARTED_EVENT,
} from '@/types/apiServerLog'

import { useApiServerLog, MAX_LOG_ENTRIES } from '../useApiServerLog'
import { resetFeedBuffers, useApiServerLogFeed } from '../useApiServerLogFeed'

// Mutable state to hold captured mock calls and handlers
const fakes = vi.hoisted(() => {
  return {
    invoked: [] as Array<{ command: string; payload?: unknown }>,
    listeners: {} as Record<string, (event: { payload: unknown }) => void>,
    unsubscribes: 0,
    reset() {
      this.invoked = []
      this.listeners = {}
      this.unsubscribes = 0
    },
  }
})

// Mock useServiceHub
vi.mock('@/hooks/useServiceHub', () => {
  return {
    useServiceHub: () => ({
      core: () => ({
        invoke: async (command: string, payload?: unknown) => {
          fakes.invoked.push({ command, payload })
          if (command === API_SERVER_LOG_SNAPSHOT_COMMAND) {
            return {
              records: [
                {
                  id: 'snapshot-1',
                  started_at_ms: 1000,
                  method: 'GET',
                  endpoint: 'models',
                  done: true,
                }
              ],
              in_flight: 0,
              dropped_events: 0,
            }
          }
          return undefined
        },
      }),
      events: () => ({
        listen: async (
          event: string,
          handler: (event: { payload: unknown }) => void
        ) => {
          fakes.listeners[event] = handler
          return () => {
            fakes.unsubscribes++
            delete fakes.listeners[event]
          }
        },
      }),
    }),
  }
})

describe('useApiServerLogFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // requestAnimationFrame mock for fake timers
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(cb, 16))
    fakes.reset()
    resetFeedBuffers()
    useApiServerLog.getState().reset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('hydrates and manages subscription lifecycle', async () => {
    const { unmount } = renderHook(() => useApiServerLogFeed())

    // Await async useEffect tasks (attach)
    await act(async () => {
      await Promise.resolve()
    })

    // Store should be hydrated with the snapshot
    const store = useApiServerLog.getState()
    expect(store.hydrated).toBe(true)
    expect(store.entries.length).toBe(1)
    expect(store.entries[0]?.id).toBe('snapshot-1')

    // Initial subscription requests
    expect(fakes.invoked).toEqual(
      expect.arrayContaining([
        { command: API_SERVER_LOG_SUBSCRIBE_COMMAND, payload: { enabled: true } },
        { command: API_SERVER_LOG_SNAPSHOT_COMMAND, payload: undefined },
      ])
    )
    expect(Object.keys(fakes.listeners)).toStrictEqual(
      expect.arrayContaining([
        API_SERVER_REQUEST_STARTED_EVENT,
        API_SERVER_REQUEST_PROGRESS_EVENT,
        API_SERVER_REQUEST_FINISHED_EVENT,
      ])
    )

    unmount()

    // Teardown should unsubscribe
    expect(fakes.unsubscribes).toBe(3) // 3 events listened
    // Unmount calls subscribe with enabled: false
    expect(fakes.invoked).toEqual(
      expect.arrayContaining([
        { command: API_SERVER_LOG_SUBSCRIBE_COMMAND, payload: { enabled: false } },
      ])
    )
  })

  it('batches pushed lines with exact ops and buffer limits', async () => {
    renderHook(() => useApiServerLogFeed())

    await act(async () => {
      await Promise.resolve()
    })

    // Simulate started event
    act(() => {
      fakes.listeners[API_SERVER_REQUEST_STARTED_EVENT]?.({
        payload: {
          id: 'req-1',
          started_at_ms: 2000,
          method: 'POST',
          endpoint: 'chat/completions',
        }
      })
    })

    // No entries added yet (batched)
    let store = useApiServerLog.getState()
    // It should have 1 entry from snapshot
    expect(store.entries.length).toBe(1)

    // Fast-forward to flush queue
    act(() => {
      vi.runAllTimers()
    })

    store = useApiServerLog.getState()
    // 2 entries (req-1 and snapshot-1)
    expect(store.entries.length).toBe(2)
    const newEntry = store.entries[0]
    expect(newEntry?.id).toBe('req-1')
    expect(newEntry?.status).toBe('in_flight')

    // Simulate progress and finish events
    act(() => {
      fakes.listeners[API_SERVER_REQUEST_PROGRESS_EVENT]?.({
        payload: {
          id: 'req-1',
          ttft_ms: 50,
          completion_tokens: 10,
        }
      })
      fakes.listeners[API_SERVER_REQUEST_FINISHED_EVENT]?.({
        payload: {
          id: 'req-1',
          status: 200,
          duration_ms: 150,
          total_tokens: 15,
        }
      })
    })

    act(() => {
      vi.runAllTimers()
    })

    store = useApiServerLog.getState()
    const updatedEntry = store.entries[0]
    expect(updatedEntry?.id).toBe('req-1')
    expect(updatedEntry?.status).toBe('completed')
    // Cast to check properties
    const reqEntry = updatedEntry as any
    expect(reqEntry.ttftMs).toBe(50)
    expect(reqEntry.durationMs).toBe(150)
    expect(reqEntry.completionTokens).toBe(10)
    expect(reqEntry.totalTokens).toBe(15)

    // Test buffer limits (trimming)
    // We add MAX_LOG_ENTRIES + 1 entries
    act(() => {
      for (let i = 0; i <= MAX_LOG_ENTRIES; i++) {
        fakes.listeners[API_SERVER_REQUEST_STARTED_EVENT]?.({
          payload: {
            id: `flood-${i}`,
            started_at_ms: 3000 + i,
            method: 'GET',
            endpoint: 'flood',
          }
        })
      }
    })

    act(() => {
      vi.runAllTimers()
    })

    store = useApiServerLog.getState()
    expect(store.entries.length).toBe(MAX_LOG_ENTRIES)
    // Newest is flood-MAX_LOG_ENTRIES
    expect(store.entries[0]?.id).toBe(`flood-${MAX_LOG_ENTRIES}`)
  })

  it('clear function resets state and calls clear command', async () => {
    const { result } = renderHook(() => useApiServerLogFeed())

    await act(async () => {
      await Promise.resolve()
    })

    // Have some state
    act(() => {
      fakes.listeners[API_SERVER_REQUEST_STARTED_EVENT]?.({
        payload: { id: 'req-clear', started_at_ms: 2000, method: 'GET', endpoint: 'clear' }
      })
      vi.runAllTimers()
    })

    let store = useApiServerLog.getState()
    expect(store.entries.length).toBeGreaterThan(0)

    // Call clear
    await act(async () => {
      await result.current.clear()
    })

    store = useApiServerLog.getState()
    expect(store.entries.length).toBe(0)
    expect(fakes.invoked).toEqual(
      expect.arrayContaining([
        { command: API_SERVER_LOG_CLEAR_COMMAND, payload: undefined }
      ])
    )
  })

  it('resetFeedBuffers clears pending state', async () => {
    renderHook(() => useApiServerLogFeed())

    await act(async () => {
      await Promise.resolve()
    })

    // Add event but don't run timers
    act(() => {
      fakes.listeners[API_SERVER_REQUEST_STARTED_EVENT]?.({
        payload: { id: 'req-pending', started_at_ms: 2000, method: 'GET', endpoint: 'pending' }
      })
    })

    // Manually clear the buffers before timers flush
    resetFeedBuffers()

    // Run timers, queue should be empty so state shouldn't have req-pending
    act(() => {
      vi.runAllTimers()
    })

    const store = useApiServerLog.getState()
    // Only snapshot should be there
    expect(store.entries.length).toBe(1)
    expect(store.entries[0]?.id).not.toBe('req-pending')
  })
})
