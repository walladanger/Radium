import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSetupCompleted, SETUP_COMPLETED_EVENT } from '../useSetupCompleted'
import { localStorageKey } from '@/constants/localStorage'

describe('useSetupCompleted', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns false when window is undefined', () => {
    const originalWindow = global.window

    const { result, unmount } = renderHook(() => {
      // Trick JSDOM/TestingLibrary: we temporarily undefine window JUST before useSetupCompleted is called
      // and restore it immediately after. This bypasses the hook execution check while keeping TL intact.
      let hookResult: boolean | undefined

      Object.defineProperty(global, 'window', { value: undefined, writable: true, configurable: true })
      try {
        hookResult = useSetupCompleted()
      } finally {
        Object.defineProperty(global, 'window', { value: originalWindow, writable: true, configurable: true })
      }
      return hookResult
    })

    expect(result.current).toBe(false)
    unmount()
  })

  it('returns true when localStorage setup-completed is true on initial render', () => {
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === localStorageKey.setupCompleted) return 'true'
      return null
    })

    const { result } = renderHook(() => useSetupCompleted())
    expect(result.current).toBe(true)
    expect(localStorage.getItem).toHaveBeenCalledWith(localStorageKey.setupCompleted)
  })

  it('returns false when localStorage setup-completed is not true on initial render', () => {
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === localStorageKey.setupCompleted) return 'false'
      return null
    })

    const { result } = renderHook(() => useSetupCompleted())
    expect(result.current).toBe(false)
    expect(localStorage.getItem).toHaveBeenCalledWith(localStorageKey.setupCompleted)
  })

  it('updates state when storage event is fired', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('false')

    const { result } = renderHook(() => useSetupCompleted())
    expect(result.current).toBe(false)

    vi.mocked(localStorage.getItem).mockReturnValue('true')

    act(() => {
      window.dispatchEvent(new Event('storage'))
    })

    expect(result.current).toBe(true)
  })

  it('updates state when custom app:setup-completed event is fired', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('false')

    const { result } = renderHook(() => useSetupCompleted())
    expect(result.current).toBe(false)

    vi.mocked(localStorage.getItem).mockReturnValue('true')

    act(() => {
      window.dispatchEvent(new Event(SETUP_COMPLETED_EVENT))
    })

    expect(result.current).toBe(true)
  })

  it('cleans up event listeners on unmount', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('false')

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { result, unmount } = renderHook(() => useSetupCompleted())

    expect(addEventListenerSpy).toHaveBeenCalledWith(SETUP_COMPLETED_EVENT, expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function))
    expect(result.current).toBe(false)

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(SETUP_COMPLETED_EVENT, expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function))
  })
})
