import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { compareSemver, useWhatsNew } from '../useWhatsNew'

// Hoist mock states so they are initialized before vi.mock blocks
const mockFetchState = vi.hoisted(() => ({
  requests: [] as string[],
  ok: true,
  data: {} as Record<string, unknown>,
}))

const mockLastSeenState = vi.hoisted(() => ({
  lastSeenVersion: null as string | null,
}))

// Mock Tauri app to fail and fall back to global VERSION
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockImplementation(() => Promise.reject(new Error('not in tauri'))),
}))

// Mock fetch globally
vi.stubGlobal(
  'fetch',
  vi.fn().mockImplementation(async (url: string) => {
    mockFetchState.requests.push(url)
    return {
      ok: mockFetchState.ok,
      json: async () => mockFetchState.data,
    }
  })
)

// Mock useLastSeenVersion hook
vi.mock('../useLastSeenVersion', () => {
  return {
    useLastSeenVersion: vi.fn().mockImplementation(() => {
      return {
        lastSeenVersion: mockLastSeenState.lastSeenVersion,
        setLastSeenVersion: (v: string) => {
          mockLastSeenState.lastSeenVersion = v
        },
      }
    }),
  }
})

describe('compareSemver', () => {
  const cases = [
    // Equal versions
    ['1.0.0', '1.0.0', 0],
    ['0.0.0', '0.0.0', 0],
    ['v1.2.3', '1.2.3', 0],

    // Major ordering
    ['2.0.0', '1.0.0', 1],
    ['1.0.0', '2.0.0', -1],

    // Minor ordering
    ['1.1.0', '1.0.0', 1],
    ['1.0.0', '1.1.0', -1],

    // Patch ordering
    ['1.0.1', '1.0.0', 1],
    ['1.0.0', '1.0.1', -1],

    // Missing segments treated as 0
    ['1', '1.0.0', 0],
    ['1.0', '1.0.0', 0],
    ['1.1', '1.0.0', 1],

    // Pre-release suffixes stripped
    ['1.2.3-beta.1', '1.2.3', 0],
    ['1.2.3', '1.2.3-beta.1', 0],
    ['v1.2.3-alpha', '1.2.3', 0],

    // Invalid/unparsable parts default to 0
    ['a.b.c', '0.0.0', 0],
  ] as const

  it.each(cases)('compares %s and %s => %i', (a, b, expected) => {
    expect(compareSemver(a, b)).toBe(expected)
  })
})

describe('useWhatsNew', () => {
  beforeEach(() => {
    mockFetchState.requests = []
    mockFetchState.ok = true
    mockFetchState.data = {}
    mockLastSeenState.lastSeenVersion = null
    vi.stubGlobal('VERSION', '1.2.0')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        mockFetchState.requests.push(url)
        return {
          ok: mockFetchState.ok,
          json: async () => mockFetchState.data,
        }
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('silently records current version on first run without opening dialog', async () => {
    const { result } = renderHook(() => useWhatsNew())

    await waitFor(() => {
      expect(mockLastSeenState.lastSeenVersion).toBe('1.2.0')
    })

    expect(result.current.open).toBe(false)
    expect(mockFetchState.requests).toEqual([])
  })

  it('does nothing if current version equals last seen version', async () => {
    mockLastSeenState.lastSeenVersion = '1.2.0'
    let result: { current: ReturnType<typeof useWhatsNew> } | undefined
    await act(async () => {
      const renderResult = renderHook(() => useWhatsNew())
      result = renderResult.result
    })

    expect(result!.current.open).toBe(false)
    expect(mockFetchState.requests).toEqual([])
    expect(mockLastSeenState.lastSeenVersion).toBe('1.2.0')
  })

  it('silently updates last seen version on downgrade', async () => {
    vi.stubGlobal('VERSION', '1.1.0') // App is older
    mockLastSeenState.lastSeenVersion = '1.2.0' // Last seen was newer
    const { result } = renderHook(() => useWhatsNew())

    await waitFor(() => {
      expect(mockLastSeenState.lastSeenVersion).toBe('1.1.0')
    })

    expect(result.current.open).toBe(false)
    expect(mockFetchState.requests).toEqual([])
  })

  it('fetches release and opens dialog on upgrade to newer version', async () => {
    vi.stubGlobal('VERSION', '1.3.0')
    mockLastSeenState.lastSeenVersion = '1.2.0'
    mockFetchState.data = {
      tag_name: 'v1.3.0',
      body: 'New release notes',
    }

    const { result } = renderHook(() => useWhatsNew())

    await waitFor(() => {
      expect(result.current.open).toBe(true)
    }, { timeout: 2000 })

    expect(mockFetchState.requests).toEqual([
      'https://api.github.com/repos/walladanger/Radium/releases/tags/v1.3.0',
    ])
    expect(result.current.release).toEqual({
      tag_name: 'v1.3.0',
      body: 'New release notes',
    })
    // lastSeenVersion not updated yet, wait for acknowledge
    expect(mockLastSeenState.lastSeenVersion).toBe('1.2.0')
  })

  it('silently updates version if fetch fails', async () => {
    vi.stubGlobal('VERSION', '1.3.0')
    mockLastSeenState.lastSeenVersion = '1.2.0'
    mockFetchState.ok = false

    const { result } = renderHook(() => useWhatsNew())

    await waitFor(() => {
      expect(mockLastSeenState.lastSeenVersion).toBe('1.3.0')
    })

    expect(result.current.open).toBe(false)
    expect(result.current.release).toBe(null)
  })

  it('silently updates version if release is a draft or prerelease', async () => {
    vi.stubGlobal('VERSION', '1.3.0')
    mockLastSeenState.lastSeenVersion = '1.2.0'
    mockFetchState.data = {
      tag_name: 'v1.3.0',
      body: 'Pre-release notes',
      prerelease: true,
    }

    const { result } = renderHook(() => useWhatsNew())

    await waitFor(() => {
      expect(mockLastSeenState.lastSeenVersion).toBe('1.3.0')
    })

    expect(result.current.open).toBe(false)
  })

  it('silently updates version if release has no body', async () => {
    vi.stubGlobal('VERSION', '1.3.0')
    mockLastSeenState.lastSeenVersion = '1.2.0'
    mockFetchState.data = {
      tag_name: 'v1.3.0',
      // missing body
    }

    const { result } = renderHook(() => useWhatsNew())

    await waitFor(() => {
      expect(mockLastSeenState.lastSeenVersion).toBe('1.3.0')
    })

    expect(result.current.open).toBe(false)
  })

  it('closes dialog and updates last seen version on acknowledge', async () => {
    vi.stubGlobal('VERSION', '1.3.0')
    mockLastSeenState.lastSeenVersion = '1.2.0'
    mockFetchState.data = {
      tag_name: 'v1.3.0',
      body: 'New release notes',
    }

    const { result } = renderHook(() => useWhatsNew())

    await waitFor(() => {
      expect(result.current.open).toBe(true)
    }, { timeout: 2000 })

    act(() => {
      result.current.acknowledge()
    })

    expect(result.current.open).toBe(false)
    expect(mockLastSeenState.lastSeenVersion).toBe('1.3.0')
  })
})
