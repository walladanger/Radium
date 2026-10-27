/**
 * Start-up policy for the configuration registries: a default build (no
 * `VITE_*_URL` overrides) touches no network, drops any copy an earlier build
 * downloaded, and only reads the model catalog from the app's own assets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRegistryBootstrapForTests } from '../registry-bootstrap'

const calls = vi.hoisted(() => ({ log: [] as string[] }))
const fetchCalls = vi.hoisted(() => ({ list: [] as string[] }))
const warns = vi.hoisted(() => ({ list: [] as string[] }))

type Overrides = Partial<
  Record<
    'providers' | 'recommended' | 'staffPicks' | 'media' | 'catalog',
    string
  >
>

async function loadBootstrap(overrides: Overrides = {}) {
  vi.resetModules()
  const record = (name: string) => () => {
    calls.log.push(name)
  }
  vi.doMock('@/services/provider-registry', () => ({
    REGISTRY_URL: overrides.providers ?? null,
    clearRegistryCache: record('clear:providers'),
  }))
  vi.doMock('@/services/recommended-models-registry', () => ({
    REGISTRY_URL: overrides.recommended ?? null,
    clearRegistryCache: record('clear:recommended'),
  }))
  vi.doMock('@/services/staff-picks-registry', () => ({
    STAFF_PICKS_URL: overrides.staffPicks ?? null,
    clearStaffPicksCache: record('clear:staff-picks'),
  }))
  vi.doMock('@/services/media-registry', () => ({
    MEDIA_REGISTRY_URL: overrides.media ?? null,
    clearMediaRegistryCache: record('clear:media'),
  }))
  vi.doMock('@/services/model-catalog-registry', () => ({
    CATALOG_URL: overrides.catalog ?? null,
    CATALOG_INDEX_URL: null,
    clearCatalogCache: async () => {
      calls.log.push('clear:catalog')
    },
  }))
  const store = (name: string) => ({
    getState: () => ({
      refresh: async () => {
        calls.log.push(`refresh:${name}`)
      },
    }),
  })
  vi.doMock('@/stores/provider-registry-store', () => ({
    useProviderRegistryStore: store('providers'),
  }))
  vi.doMock('@/stores/recommended-models-registry-store', () => ({
    useRecommendedModelsRegistryStore: store('recommended'),
  }))
  vi.doMock('@/stores/staff-picks-store', () => ({
    useStaffPicksStore: store('staff-picks'),
  }))
  vi.doMock('@/stores/model-catalog-store', () => ({
    useModelCatalogStore: store('catalog'),
  }))
  return import('../registry-bootstrap')
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('bootstrapRegistries', () => {
  beforeEach(() => {
    calls.log = []
    fetchCalls.list = []
    warns.list = []
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('in a default build drops stale caches, refreshes nothing remote and fetches nothing', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      fetchCalls.list.push(url)
    })
    const { bootstrapRegistries } = await loadBootstrap()

    bootstrapRegistries()
    await settle()

    expect([...calls.log].sort()).toEqual(
      [
        'clear:catalog',
        'clear:media',
        'clear:providers',
        'clear:recommended',
        'clear:staff-picks',
        // The catalog store reads the bundled seed; it is always started.
        'refresh:catalog',
      ].sort()
    )
    expect(fetchCalls.list).toEqual([]) // Verify no fetches were performed by checking the array
  })

  it('refreshes only the registries whose build sets an override', async () => {
    const { bootstrapRegistries } = await loadBootstrap({
      staffPicks: 'https://registry.example/staff-picks.json',
      media: 'https://registry.example/media.json',
    })

    bootstrapRegistries()
    await settle()

    expect([...calls.log].sort()).toEqual(
      [
        'clear:providers',
        'clear:recommended',
        'clear:catalog',
        'refresh:staff-picks',
        'refresh:catalog', // catalog always gets refreshed
      ].sort()
    )
  })

  it('does its work once (idempotent)', async () => {
    const { bootstrapRegistries } = await loadBootstrap()

    bootstrapRegistries()
    await settle()

    // Attempt second time
    bootstrapRegistries()
    await settle()

    // Assert concrete state again - should equal running it just once
    expect([...calls.log].sort()).toEqual(
      [
        'clear:catalog',
        'clear:media',
        'clear:providers',
        'clear:recommended',
        'clear:staff-picks',
        'refresh:catalog',
      ].sort()
    )
  })

  it('allows bootstrap to run again after resetRegistryBootstrapForTests()', async () => {
    const { bootstrapRegistries, resetRegistryBootstrapForTests } =
      await loadBootstrap()

    bootstrapRegistries()
    await settle()

    resetRegistryBootstrapForTests()
    bootstrapRegistries()
    await settle()

    // Assert concrete state - should have double the entries
    expect([...calls.log].sort()).toEqual(
      [
        'clear:catalog',
        'clear:catalog',
        'clear:media',
        'clear:media',
        'clear:providers',
        'clear:providers',
        'clear:recommended',
        'clear:recommended',
        'clear:staff-picks',
        'clear:staff-picks',
        'refresh:catalog',
        'refresh:catalog',
      ].sort()
    )
  })

  it('warns on refresh error', async () => {
    vi.resetModules()
    const record = (name: string) => () => {
      calls.log.push(name)
    }
    vi.doMock('@/services/provider-registry', () => ({
      REGISTRY_URL: 'error_provider',
      clearRegistryCache: record('clear:providers'),
    }))
    vi.doMock('@/services/recommended-models-registry', () => ({
      REGISTRY_URL: null,
      clearRegistryCache: record('clear:recommended'),
    }))
    vi.doMock('@/services/staff-picks-registry', () => ({
      STAFF_PICKS_URL: null,
      clearStaffPicksCache: record('clear:staff-picks'),
    }))
    vi.doMock('@/services/media-registry', () => ({
      MEDIA_REGISTRY_URL: null,
      clearMediaRegistryCache: record('clear:media'),
    }))
    vi.doMock('@/services/model-catalog-registry', () => ({
      CATALOG_URL: null,
      CATALOG_INDEX_URL: null,
      clearCatalogCache: async () => {
        calls.log.push('clear:catalog')
      },
    }))

    vi.doMock('@/stores/provider-registry-store', () => ({
      useProviderRegistryStore: {
        getState: () => ({
          refresh: async () => {
            throw new Error('Refresh error mock')
          },
        }),
      },
    }))
    vi.doMock('@/stores/recommended-models-registry-store', () => ({
      useRecommendedModelsRegistryStore: {
        getState: () => ({ refresh: async () => {} }),
      },
    }))
    vi.doMock('@/stores/staff-picks-store', () => ({
      useStaffPicksStore: {
        getState: () => ({ refresh: async () => {} }),
      },
    }))
    vi.doMock('@/stores/model-catalog-store', () => ({
      useModelCatalogStore: {
        getState: () => ({
          refresh: async () => {
            throw 'Catalog error string'
          },
        }),
      },
    }))

    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation((...args) => {
        // Serialize error args safely for comparison to concrete array
        const serializedArgs = args.map((arg) =>
          arg instanceof Error ? arg.message : arg
        )
        warns.list.push(`warn:${serializedArgs.join(' ')}`)
      })

    const { bootstrapRegistries, resetRegistryBootstrapForTests } =
      await import('../registry-bootstrap')
    resetRegistryBootstrapForTests()
    bootstrapRegistries()
    await settle()

    const warnsList = [...warns.list].sort()

    expect(warnsList).toEqual([
      'warn:[registry-bootstrap] model-catalog: Catalog error string',
      'warn:[registry-bootstrap] providers: Refresh error mock',
    ])

    consoleWarnSpy.mockRestore()
  })
})
