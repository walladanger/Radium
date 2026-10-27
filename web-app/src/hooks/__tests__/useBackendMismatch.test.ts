import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  useBackendMismatch,
  mismatchPairKey,
  BACKEND_MISMATCH_PROMPT_EVENT,
  BackendMismatchEvent,
  BackendRuntimeEvent,
  useBackendMismatchStore,
  useSuppressedPairs
} from '../useBackendMismatch'
import { localStorageKey } from '@/constants/localStorage'

describe('useBackendMismatch', () => {
  beforeEach(() => {
    localStorage.clear()
    act(() => {
      useBackendMismatchStore.setState({ pending: null, shownThisSession: [] })
      useSuppressedPairs.setState({ suppressedPairs: [] })
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mismatchPairKey logic generates expected keys', () => {
    const silentFallback: BackendMismatchEvent = {
      provider: 'turboquant',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: {
        kind: 'silent-fallback',
        configured: 'cpu',
        effective: 'gpu'
      }
    }
    expect(mismatchPairKey(silentFallback)).toStrictEqual('turboquant|silent-fallback|cpu|gpu')

    const runtimeCpu: BackendMismatchEvent = {
      provider: 'turboquant',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: {
        kind: 'runtime-cpu',
        configured: 'gpu',
        primaryDevice: 'cuda-0',
        offloaded: 0,
        total: 10,
        gpuKind: 'cuda',
        cudaRuntimeMissing: false,
        deviceInitError: null
      }
    }
    expect(mismatchPairKey(runtimeCpu)).toStrictEqual('turboquant|runtime-cpu|gpu|cuda-0')

    const suboptimalConfig: BackendMismatchEvent = {
      provider: 'turboquant',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: {
        kind: 'suboptimal-config',
        configured: 'cpu',
        ideal: 'gpu'
      }
    }
    expect(mismatchPairKey(suboptimalConfig)).toStrictEqual('turboquant|suboptimal-config|cpu|gpu')
  })

  it('initial state should have shouldPrompt false and pending null', () => {
    const { result } = renderHook(() => useBackendMismatch())
    expect(result.current.pending).toBeNull()
    expect(result.current.shouldPrompt).toStrictEqual(false)
  })

  it('reports mismatch event and updates shouldPrompt', () => {
    const { result } = renderHook(() => useBackendMismatch())
    const event: BackendRuntimeEvent = {
      provider: 'turboquant',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: {
        kind: 'silent-fallback',
        configured: 'cpu',
        effective: 'gpu'
      }
    }

    act(() => {
      result.current.report(event)
    })

    expect(result.current.pending).toStrictEqual({
      ...event,
      mismatch: event.mismatch
    })
    expect(result.current.shouldPrompt).toStrictEqual(true)
  })

  it('reports "ok" and clears pending if same provider', () => {
    const { result } = renderHook(() => useBackendMismatch())
    const mismatchEvent: BackendRuntimeEvent = {
      provider: 'turboquant',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: {
        kind: 'silent-fallback',
        configured: 'cpu',
        effective: 'gpu'
      }
    }

    act(() => {
      result.current.report(mismatchEvent)
    })
    expect(result.current.shouldPrompt).toStrictEqual(true)

    const okEvent: BackendRuntimeEvent = {
      provider: 'turboquant',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: { kind: 'ok' }
    }

    act(() => {
      result.current.report(okEvent)
    })
    expect(result.current.pending).toBeNull()
    expect(result.current.shouldPrompt).toStrictEqual(false)
  })

  it('reports "ok" from different provider does not clear pending', () => {
    const { result } = renderHook(() => useBackendMismatch())
    const mismatchEvent: BackendRuntimeEvent = {
      provider: 'turboquant',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: {
        kind: 'silent-fallback',
        configured: 'cpu',
        effective: 'gpu'
      }
    }

    act(() => {
      result.current.report(mismatchEvent)
    })

    const okEvent: BackendRuntimeEvent = {
      provider: 'other-provider',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: { kind: 'ok' }
    }

    act(() => {
      result.current.report(okEvent)
    })
    expect(result.current.pending).not.toBeNull()
    expect(result.current.shouldPrompt).toStrictEqual(true)
  })

  it('markShown prevents prompting again in the same session', () => {
    const { result } = renderHook(() => useBackendMismatch())
    const event: BackendRuntimeEvent = {
      provider: 'turboquant',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: {
        kind: 'silent-fallback',
        configured: 'cpu',
        effective: 'gpu'
      }
    }

    act(() => {
      result.current.report(event)
    })
    expect(result.current.shouldPrompt).toStrictEqual(true)

    act(() => {
      result.current.markShown()
    })
    expect(result.current.shouldPrompt).toStrictEqual(false)

    // Clear and report again to simulate new load, should still be false
    act(() => {
      result.current.dismiss()
      result.current.report(event)
    })
    expect(result.current.shouldPrompt).toStrictEqual(false)
  })

  it('suppress prevents prompting across sessions (localStorage)', () => {
    const { result } = renderHook(() => useBackendMismatch())
    const event: BackendRuntimeEvent = {
      provider: 'turboquant',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: {
        kind: 'silent-fallback',
        configured: 'cpu',
        effective: 'gpu'
      }
    }

    act(() => {
      result.current.report(event)
    })
    expect(result.current.shouldPrompt).toStrictEqual(true)

    act(() => {
      result.current.suppress()
    })
    expect(result.current.shouldPrompt).toStrictEqual(false)

    // Check localStorage
    const stored = localStorage.getItem(localStorageKey.backendMismatchSuppressed)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.state.suppressedPairs).toContain('turboquant|silent-fallback|cpu|gpu')

    // Simulate new session
    act(() => {
      useBackendMismatchStore.setState({ pending: null, shownThisSession: [] })
    })

    act(() => {
      result.current.report(event)
    })
    expect(result.current.shouldPrompt).toStrictEqual(false)
  })

  it('dismiss clears pending', () => {
    const { result } = renderHook(() => useBackendMismatch())
    const event: BackendRuntimeEvent = {
      provider: 'turboquant',
      modelId: 'test-model',
      configuredVersionBackend: 'v1.0.0',
      effectiveVersionBackend: 'v1.0.0',
      mismatch: {
        kind: 'silent-fallback',
        configured: 'cpu',
        effective: 'gpu'
      }
    }

    act(() => {
      result.current.report(event)
    })
    expect(result.current.pending).not.toBeNull()

    act(() => {
      result.current.dismiss()
    })
    expect(result.current.pending).toBeNull()
    expect(result.current.shouldPrompt).toStrictEqual(false)
  })

  it('can dispatch BACKEND_MISMATCH_PROMPT_EVENT window event successfully', () => {
    let capturedEvent: Event | null = null
    const handler = (e: Event) => {
      capturedEvent = e
    }

    window.addEventListener(BACKEND_MISMATCH_PROMPT_EVENT, handler)
    window.dispatchEvent(new CustomEvent(BACKEND_MISMATCH_PROMPT_EVENT))
    window.removeEventListener(BACKEND_MISMATCH_PROMPT_EVENT, handler)

    expect(capturedEvent).not.toBeNull()
    expect(capturedEvent?.type).toStrictEqual('app:backend-mismatch-prompt')
  })
})
