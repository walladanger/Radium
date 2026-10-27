import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  REGISTRY_URL: 'https://example.com/registry' as string | null,
  bundledResult: vi.fn(),
  getCachedManifest: vi.fn(),
  getProvidersOrFallback: vi.fn(),
  mergeWithBaseline: vi.fn(),
}))

vi.mock('@/services/provider-registry', () => ({
  get REGISTRY_URL() {
    return mocks.REGISTRY_URL
  },
  bundledResult: mocks.bundledResult,
  getCachedManifest: mocks.getCachedManifest,
  getProvidersOrFallback: mocks.getProvidersOrFallback,
  mergeWithBaseline: mocks.mergeWithBaseline,
}))

describe('provider-registry-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('seed state', () => {
    afterEach(() => {
      vi.resetModules()
    })

    it('uses bundledResult and skips cache when REGISTRY_URL is null', async () => {
      mocks.REGISTRY_URL = null
      mocks.bundledResult.mockReturnValue({
        providers: [{ provider: 'bundled-provider' }],
        source: 'bundled',
        manifestUpdatedAt: '2024-01-01',
      })

      const { useProviderRegistryStore } = await import(
        '../provider-registry-store'
      )
      const state = useProviderRegistryStore.getState()

      expect(mocks.getCachedManifest).not.toHaveBeenCalled()
      expect(state.hasInitialized).toBe(true)
      expect(state.providers).toStrictEqual([{ provider: 'bundled-provider' }])
      expect(state.source).toBe('bundled')
      expect(state.fetchedAt).toBeNull()
      expect(state.manifestUpdatedAt).toBe('2024-01-01')
    })

    it('uses cached manifest when REGISTRY_URL is set and cache exists', async () => {
      mocks.REGISTRY_URL = 'https://example.com/registry'
      mocks.getCachedManifest.mockReturnValue({
        fetchedAt: 1234567890,
        manifest: {
          updated_at: '2024-02-02',
          providers: [{ provider: 'cached-provider' }],
        },
      })
      mocks.mergeWithBaseline.mockReturnValue([
        { provider: 'merged-provider' },
      ])

      const { useProviderRegistryStore } = await import(
        '../provider-registry-store'
      )
      const state = useProviderRegistryStore.getState()

      expect(mocks.getCachedManifest).toHaveBeenCalled()
      expect(mocks.mergeWithBaseline).toHaveBeenCalledWith([
        { provider: 'cached-provider' },
      ])
      expect(state.hasInitialized).toBe(false)
      expect(state.providers).toStrictEqual([{ provider: 'merged-provider' }])
      expect(state.source).toBe('cache')
      expect(state.fetchedAt).toBe(1234567890)
      expect(state.manifestUpdatedAt).toBe('2024-02-02')
    })
  })

  describe('actions and accessors', () => {
    let useStore: typeof import('../provider-registry-store').useProviderRegistryStore
    let isKnownProvider: typeof import('../provider-registry-store').isKnownProvider
    let getRegistryProvidersSync: typeof import('../provider-registry-store').getRegistryProvidersSync
    let ensureRegistryLoaded: typeof import('../provider-registry-store').ensureRegistryLoaded

    let initialState: ReturnType<
      typeof import('../provider-registry-store').useProviderRegistryStore.getState
    >

    beforeEach(async () => {
      mocks.REGISTRY_URL = 'https://example.com/registry'
      mocks.getCachedManifest.mockReturnValue(null) // start with no cache to let it init via refresh or bundled fallback logic
      mocks.bundledResult.mockReturnValue({
        providers: [],
        source: 'bundled',
        manifestUpdatedAt: '2023-01-01',
      })

      const module = await import('../provider-registry-store')
      useStore = module.useProviderRegistryStore
      isKnownProvider = module.isKnownProvider
      getRegistryProvidersSync = module.getRegistryProvidersSync
      ensureRegistryLoaded = module.ensureRegistryLoaded

      initialState = useStore.getState()
    })

    afterEach(() => {
      useStore.setState(initialState, true)
    })

    it('refresh() writes success state on successful fetch', async () => {
      mocks.getProvidersOrFallback.mockResolvedValue({
        providers: [{ provider: 'remote-provider' }],
        source: 'remote',
        fetchedAt: 987654321,
        manifestUpdatedAt: '2024-03-03',
        error: undefined,
      })

      await useStore.getState().refresh()

      const state = useStore.getState()
      expect(state.status).toBe('success')
      expect(state.error).toBeNull()
      expect(state.hasInitialized).toBe(true)
      expect(state.providers).toStrictEqual([{ provider: 'remote-provider' }])
      expect(state.source).toBe('remote')
      expect(state.fetchedAt).toBe(987654321)
      expect(state.manifestUpdatedAt).toBe('2024-03-03')
    })

    it('refresh() uses deterministic terminal state on unexpected error', async () => {
      mocks.getProvidersOrFallback.mockRejectedValue(new Error('Network boom'))
      mocks.bundledResult.mockReturnValue({
        providers: [{ provider: 'fallback-provider' }],
        source: 'bundled',
        manifestUpdatedAt: '2024-04-04',
        error: 'Network boom',
      })

      await useStore.getState().refresh()

      const state = useStore.getState()
      expect(mocks.bundledResult).toHaveBeenCalledWith('Network boom')
      expect(state.status).toBe('error')
      expect(state.error).toBe('Network boom')
      expect(state.hasInitialized).toBe(true)
      expect(state.providers).toStrictEqual([{ provider: 'fallback-provider' }])
      expect(state.source).toBe('bundled')
      expect(state.fetchedAt).toBeUndefined()
      expect(state.manifestUpdatedAt).toBe('2024-04-04')
    })

    it('refresh() uses fallback error message for non-Error throws', async () => {
      mocks.getProvidersOrFallback.mockRejectedValue('String error')
      mocks.bundledResult.mockReturnValue({
        providers: [],
        source: 'bundled',
        manifestUpdatedAt: null,
        error: 'Unknown registry error',
      })

      await useStore.getState().refresh()

      const state = useStore.getState()
      expect(mocks.bundledResult).toHaveBeenCalledWith('Unknown registry error')
      expect(state.status).toBe('error')
      expect(state.error).toBe('Unknown registry error')
    })

    it('status is loading while refresh promise is pending', async () => {
      let resolvePromise: (value: any) => void
      mocks.getProvidersOrFallback.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const refreshPromise = useStore.getState().refresh()

      expect(useStore.getState().status).toBe('loading')
      expect(useStore.getState().error).toBeNull()

      resolvePromise!({
        providers: [],
        source: 'remote',
        fetchedAt: 1,
        manifestUpdatedAt: null,
      })
      await refreshPromise

      expect(useStore.getState().status).toBe('success')
    })

    it('synchronous accessors return current store state', () => {
      useStore.setState({
        providers: [{ provider: 'test-sync' } as any],
      })

      expect(getRegistryProvidersSync()).toStrictEqual([
        { provider: 'test-sync' },
      ])
      expect(isKnownProvider('test-sync')).toBe(true)
      expect(isKnownProvider('unknown')).toBe(false)
      expect(isKnownProvider('')).toBe(false)
    })

    it('ensureRegistryLoaded() skips refresh if already initialized', async () => {
      useStore.setState({ hasInitialized: true, providers: [{ provider: 'pre-loaded' } as any] })
      mocks.getProvidersOrFallback.mockClear()

      const result = await ensureRegistryLoaded()

      expect(mocks.getProvidersOrFallback).not.toHaveBeenCalled()
      expect(result).toStrictEqual([{ provider: 'pre-loaded' }])
    })

    it('ensureRegistryLoaded() calls refresh if not initialized', async () => {
      useStore.setState({ hasInitialized: false, providers: [] })
      mocks.getProvidersOrFallback.mockResolvedValue({
        providers: [{ provider: 'loaded-provider' }],
        source: 'remote',
        fetchedAt: 1,
        manifestUpdatedAt: null,
      })

      const providers = await ensureRegistryLoaded()

      expect(mocks.getProvidersOrFallback).toHaveBeenCalled()
      expect(providers).toStrictEqual([{ provider: 'loaded-provider' }])
    })
  })
})
