import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { localStorageKey } from '@/constants/localStorage'

import { useLastSeenVersion } from '../useLastSeenVersion'

describe('useLastSeenVersion', () => {
  beforeEach(() => {
    localStorage.clear()
    useLastSeenVersion.setState({ lastSeenVersion: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('has correct initial state', () => {
    const { result } = renderHook(() => useLastSeenVersion())
    expect(result.current.lastSeenVersion).toBe(null)
  })

  it('updates lastSeenVersion and persists to localStorage', () => {
    const { result } = renderHook(() => useLastSeenVersion())

    act(() => {
      result.current.setLastSeenVersion('1.2.3')
    })

    expect(result.current.lastSeenVersion).toBe('1.2.3')
    expect(localStorage.getItem(localStorageKey.lastSeenVersion)).toBe(
      JSON.stringify({ state: { lastSeenVersion: '1.2.3' }, version: 0 })
    )
  })

  it('handles missing data in localStorage', () => {
    localStorage.removeItem(localStorageKey.lastSeenVersion)

    useLastSeenVersion.persist.rehydrate()

    const { result } = renderHook(() => useLastSeenVersion())
    expect(result.current.lastSeenVersion).toBe(null)
  })

  it('handles malformed data in localStorage', () => {
    localStorage.setItem(localStorageKey.lastSeenVersion, 'not-json')

    useLastSeenVersion.persist.rehydrate()

    const { result } = renderHook(() => useLastSeenVersion())
    expect(result.current.lastSeenVersion).toBe(null)
  })

  it('initializes from valid data in localStorage', () => {
    localStorage.setItem(
      localStorageKey.lastSeenVersion,
      JSON.stringify({ state: { lastSeenVersion: '1.4.5' }, version: 0 })
    )

    useLastSeenVersion.persist.rehydrate()

    const { result } = renderHook(() => useLastSeenVersion())
    expect(result.current.lastSeenVersion).toBe('1.4.5')
  })
})
