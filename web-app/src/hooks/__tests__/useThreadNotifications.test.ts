import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useThreadNotifications } from '../useThreadNotifications'
import { localStorageKey } from '@/constants/localStorage'

describe('useThreadNotifications', () => {
  beforeEach(() => {
    localStorage.clear()
    useThreadNotifications.setState({ globallyEnabled: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('initializes with globallyEnabled set to true', () => {
    const { result } = renderHook(() => useThreadNotifications())
    expect(result.current.globallyEnabled).toBe(true)
  })

  it('updates globallyEnabled when setGloballyEnabled is called', () => {
    const { result } = renderHook(() => useThreadNotifications())

    act(() => {
      result.current.setGloballyEnabled(false)
    })

    expect(result.current.globallyEnabled).toBe(false)
  })

  it('persists globallyEnabled to localStorage', () => {
    const { result } = renderHook(() => useThreadNotifications())

    act(() => {
      result.current.setGloballyEnabled(false)
    })

    const storedRaw = localStorage.getItem(localStorageKey.threadNotifications)
    expect(storedRaw).not.toBeNull()
    const stored = JSON.parse(storedRaw as string)
    expect(stored.state.globallyEnabled).toBe(false)
  })

  it('partializes the state before storing', () => {
    const { result } = renderHook(() => useThreadNotifications())

    act(() => {
      result.current.setGloballyEnabled(false)
    })

    const storedRaw = localStorage.getItem(localStorageKey.threadNotifications)
    const stored = JSON.parse(storedRaw as string)

    expect(stored.state).toStrictEqual({
      globallyEnabled: false,
    })
    expect(stored.state).not.toHaveProperty('setGloballyEnabled')
  })
})
